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
