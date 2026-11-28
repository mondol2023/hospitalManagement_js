'use strict';

const BaseRepository = require('../../src/repositories/BaseRepository');

// A chainable stand-in for a Mongoose query: only what `findById` touches.
function fakeModel(doc) {
  const query = { lean: jest.fn(() => query), populate: jest.fn(() => query), exec: jest.fn(async () => doc) };
  return { modelName: 'Widget', findById: jest.fn(() => query), query };
}

describe('BaseRepository.findByIdOrThrow', () => {
  it('returns the document when it exists', async () => {
    const doc = { _id: '1' };
    const repo = new BaseRepository(fakeModel(doc));
    await expect(repo.findByIdOrThrow('1', 'Widget')).resolves.toBe(doc);
  });

  it('throws a 404 ApiError naming the label when nothing matches', async () => {
    const repo = new BaseRepository(fakeModel(null));
    await expect(repo.findByIdOrThrow('1', 'Widget')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Widget not found',
    });
  });

  it('defaults the label to the model name', async () => {
    const repo = new BaseRepository(fakeModel(null));
    await expect(repo.findByIdOrThrow('1')).rejects.toMatchObject({ message: 'Widget not found' });
  });

  it('passes projection and populate options through to findById', async () => {
    const model = fakeModel({ _id: '1' });
    const repo = new BaseRepository(model);
    await repo.findByIdOrThrow('1', 'Widget', { projection: 'name', populate: 'owner' });
    expect(model.findById).toHaveBeenCalledWith('1', 'name', { session: undefined });
    expect(model.query.populate).toHaveBeenCalledWith('owner');
  });
});

describe('BaseRepository branches option', () => {
  // Records `setOptions` on every query the repository builds.
  function recordingModel() {
    const calls = [];
    const makeQuery = () => {
      const q = {};
      ['sort', 'skip', 'limit', 'lean', 'populate'].forEach((m) => { q[m] = jest.fn(() => q); });
      q.setOptions = jest.fn((o) => { calls.push(o); return q; });
      q.exec = jest.fn(async () => []);
      q.then = (res) => Promise.resolve(0).then(res);
      return q;
    };
    return {
      calls,
      modelName: 'Widget',
      find: jest.fn(makeQuery),
      findOne: jest.fn(makeQuery),
      findById: jest.fn(makeQuery),
      countDocuments: jest.fn(makeQuery),
      aggregate: jest.fn(() => {
        const a = { session: () => a, exec: async () => [], option: jest.fn((o) => { calls.push(o); return a; }) };
        return a;
      }),
    };
  }

  it.each(['find', 'findOne', 'findById', 'paginate', 'count', 'aggregate'])('%s forwards branches', async (method) => {
    const model = recordingModel();
    const repo = new BaseRepository(model);
    const args = { find: [{}], findOne: [{}], findById: ['1'], paginate: [{}, {}], count: [{}], aggregate: [[]] }[method];
    const options = { branches: 'all' };
    if (method === 'paginate') args.push({ ...options });
    else args.push(options);
    await repo[method](...args);
    expect(model.calls).toContainEqual({ branches: 'all' });
  });

  it('does not call setOptions when branches is absent', async () => {
    const model = recordingModel();
    await new BaseRepository(model).find({});
    expect(model.calls).toEqual([]);
  });
});
