import { getProposal } from '../../../src/helpers/utils';

const PROPOSAL = { id: '0x0', flagged: false };

const mockSnapshotUtilsSubgraphRequest = jest.fn((): any => {
  return {};
});
jest.mock('@snapshot-labs/snapshot.js', () => {
  const originalModule = jest.requireActual('@snapshot-labs/snapshot.js');

  return {
    ...originalModule,
    utils: {
      ...originalModule.utils,
      subgraphRequest: () => mockSnapshotUtilsSubgraphRequest()
    }
  };
});

describe('getProposal()', () => {
  it('returns null when the proposal is flagged', () => {
    mockSnapshotUtilsSubgraphRequest.mockResolvedValueOnce({
      proposal: { ...PROPOSAL, flagged: true }
    });
    expect(getProposal('')).resolves.toBeNull();
  });

  it('returns null when the proposal does not exist', () => {
    mockSnapshotUtilsSubgraphRequest.mockResolvedValueOnce({ proposal: null });
    expect(getProposal('')).resolves.toBeNull();
  });

  it('returns null on missing response', () => {
    mockSnapshotUtilsSubgraphRequest.mockResolvedValueOnce({});
    expect(getProposal('')).resolves.toBeNull();
  });

  it('returns the proposal', () => {
    mockSnapshotUtilsSubgraphRequest.mockResolvedValueOnce({
      proposal: PROPOSAL
    });
    expect(getProposal('')).resolves.toEqual(PROPOSAL);
  });
});
