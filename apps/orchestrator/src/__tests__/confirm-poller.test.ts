import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfirmPoller } from "../pipeline/confirm-poller.js";

function makeDbMock({
  pendingExpired = [] as { id: string }[],
  confirmed = [] as { id: string }[],
  updateReturnId = true,
} = {}) {
  const insertMock = { values: vi.fn().mockResolvedValue([]) };

  // update mock: 체이닝 구조 (.set().where().returning())
  const returningMock = vi.fn().mockResolvedValue(
    updateReturnId ? [{ id: "test-id" }] : []
  );
  const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  // select mock: pending 만료 / confirmed 각각 다른 응답
  let selectCallCount = 0;
  const selectMock = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        selectCallCount++;
        // 첫 번째 select → 만료된 pending, 두 번째 → confirmed
        return Promise.resolve(selectCallCount === 1 ? pendingExpired : confirmed);
      }),
    }),
  }));

  return {
    select: selectMock,
    update: updateMock,
    insert: vi.fn().mockReturnValue(insertMock),
    _mocks: { update: updateMock, insert: insertMock, returningMock },
  };
}

describe("ConfirmPoller.tick", () => {
  it("만료된 pending → expired 전이 + 감사 로그 삽입", async () => {
    const db = makeDbMock({ pendingExpired: [{ id: "dec-1" }] });
    const executor = vi.fn();
    const poller = new ConfirmPoller(db as any, executor);

    await poller.tick();

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    const insertArgs = db.insert.mock.calls[0][0]; // decisionEvents 테이블
    expect(insertArgs).toBeDefined();
  });

  it("UPDATE 경쟁으로 returning 빈 배열 → 감사 로그 미삽입 (레이스 컨디션 처리)", async () => {
    const db = makeDbMock({
      pendingExpired: [{ id: "dec-race" }],
      updateReturnId: false,
    });
    const executor = vi.fn();
    const poller = new ConfirmPoller(db as any, executor);

    await poller.tick();

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("confirmed 판단 → executeOrder 호출", async () => {
    const db = makeDbMock({ confirmed: [{ id: "dec-confirmed" }] });
    const executor = vi.fn().mockResolvedValue(undefined);
    const poller = new ConfirmPoller(db as any, executor);

    await poller.tick();

    expect(executor).toHaveBeenCalledWith("dec-confirmed");
  });

  it("tick 실행 중 재진입 → 두 번째 tick 무시", async () => {
    // isRunning 플래그가 첫 번째 tick 완료 전에 true임을 검증
    // → 두 번째 tick이 동기 진입 직후 return해야 함
    let resolveFirst!: () => void;
    const firstTickPromise = new Promise<{ id: string }[]>((res) => {
      resolveFirst = () => res([]);
    });

    let selectCallCount = 0;
    const slowDb = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        return {
          from: vi.fn().mockReturnValue({
            // 첫 번째 호출만 느린 Promise, 이후엔 즉시 반환
            where: vi.fn().mockReturnValue(
              selectCallCount === 1 ? firstTickPromise : Promise.resolve([])
            ),
          }),
        };
      }),
      update: vi.fn(),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    };
    const executor = vi.fn();
    const poller = new ConfirmPoller(slowDb as any, executor);

    // tick1 시작 → isRunning=true, 첫 select await 중
    const tick1 = poller.tick();
    // tick2: isRunning=true이므로 즉시 return (select 호출 없음)
    const tick2 = poller.tick();

    resolveFirst(); // tick1의 expireStale select 완료
    await tick1;
    await tick2;

    // select는 tick1의 expireStale(1회) + executeConfirmed(1회) = 2회
    // tick2는 재진입 방지로 select 호출 없음 → 총 2회
    expect(slowDb.select).toHaveBeenCalledTimes(2);
  });

  it("만료 없고 confirmed 없음 → executor 미호출", async () => {
    const db = makeDbMock();
    const executor = vi.fn();
    const poller = new ConfirmPoller(db as any, executor);

    await poller.tick();

    expect(executor).not.toHaveBeenCalled();
  });
});
