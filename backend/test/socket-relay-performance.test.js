jest.mock('../src/models/SocketRelayEvent', () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  destroy: jest.fn(),
}));
jest.mock('../src/config/instance', () => ({ getInstanceId: () => 'test-instance' }));
jest.mock('../src/utils/logger', () => ({ warn: jest.fn() }));

const SocketRelayEvent = require('../src/models/SocketRelayEvent');
const relay = require('../src/socket/crossInstance');

const io = {
  of: () => ({ sockets: new Map(), adapter: { rooms: new Map() } }),
  to: () => ({ emit: jest.fn() }),
  emit: jest.fn(),
};

describe('database socket relay performance', () => {
  afterEach(() => {
    relay.stopRelayPoller();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('does not overlap polling cycles when a database query is slow', async () => {
    jest.useFakeTimers();
    let finishFirst;
    SocketRelayEvent.findAll
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue([]);

    relay.startRelayPoller(io, { intervalMs: 10 });
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    expect(SocketRelayEvent.findAll).toHaveBeenCalledTimes(1);

    finishFirst([]);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    await Promise.resolve();
    expect(SocketRelayEvent.findAll).toHaveBeenCalledTimes(2);
  });

  test('removes expired relay rows with one bulk delete', async () => {
    const createdAt = new Date(Date.now() - 10_000);
    SocketRelayEvent.findAll.mockResolvedValue([
      { id: 41, targetType: 'room', target: 'one', event: 'event', payload: {}, createdAt },
      { id: 42, targetType: 'room', target: 'two', event: 'event', payload: {}, createdAt },
    ]);
    SocketRelayEvent.destroy.mockResolvedValue(2);

    await relay.runPollCycle(io, { maxAgeMs: 5000 });

    expect(SocketRelayEvent.destroy).toHaveBeenCalledTimes(1);
    const ids = SocketRelayEvent.destroy.mock.calls[0][0].where.id;
    expect(Object.getOwnPropertySymbols(ids)).toHaveLength(1);
    expect(ids[Object.getOwnPropertySymbols(ids)[0]]).toEqual([41, 42]);
  });
});
