import { gql, ApolloClient, InMemoryCache, HttpLink } from '@apollo/client/core';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { fetchWithKeepAlive } from './utils';

const HUB_URL = `${process.env.HUB_URL || 'https://hub.snapshot.org'}/graphql`;

const client = new ApolloClient({
  link: new HttpLink({ uri: HUB_URL, fetch: fetchWithKeepAlive as any }),
  cache: new InMemoryCache({
    addTypename: false
  }),
  defaultOptions: {
    query: {
      fetchPolicy: 'no-cache'
    }
  }
});

type Message = {
  mci: number;
  id: string;
  ipfs: string;
  type: string;
  timestamp: number;
  space: string;
};

type Space = {
  id: string;
  name: string;
  avatar?: string;
};

type Proposal = {
  space: Space;
  id: string;
  type: string;
  author: string;
  title: string;
  body: string;
  choices: string[];
  created: number;
  start: number;
  end: number;
  link: string;
  snapshot: string;
};

type Subscription = {
  address: string;
};

const MESSAGES_QUERY = gql`
  query Messages(
    $type_in: [String]
    $first: Int
    $mci: Int
    $orderDirection: OrderDirection
    $orderBy: String
  ) {
    messages(
      where: { mci_gt: $mci, type_in: $type_in }
      first: $first
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      mci
      id
      ipfs
      type
      timestamp
      space
    }
  }
`;

const SPACE_QUERY = gql`
  query Space($id: String) {
    space(id: $id) {
      id
      name
    }
  }
`;

const PROPOSAL_QUERY = gql`
  query Proposal($id: String) {
    proposal(id: $id) {
      space {
        id
        name
        avatar
      }
      id
      type
      author
      title
      body
      choices
      created
      start
      end
      link
      snapshot
    }
  }
`;

const SUBSCRIPTIONS_QUERY = gql`
  query Subscriptions($space: String) {
    subscriptions(where: { space: $space }) {
      address
    }
  }
`;

export async function getNextMessages(mci: number) {
  try {
    const {
      data: { messages }
    }: { data: { messages: Message[] } } = await client.query({
      query: MESSAGES_QUERY,
      variables: {
        mci,
        type_in: ['proposal', 'delete-proposal'],
        first: 10,
        orderBy: 'mci',
        orderDirection: 'asc'
      }
    });

    return messages;
  } catch (e: any) {
    capture(e);
    return [];
  }
}

export async function getSpace(id: string) {
  try {
    const {
      data: { space }
    }: { data: { space: Space | null } } = await client.query({
      query: SPACE_QUERY,
      variables: {
        id
      }
    });

    return space;
  } catch (e: any) {
    capture(e);
    return null;
  }
}

export async function getProposal(id: string) {
  try {
    const {
      data: { proposal }
    }: { data: { proposal: Proposal | null } } = await client.query({
      query: PROPOSAL_QUERY,
      variables: {
        id
      }
    });

    return proposal;
  } catch (e: any) {
    capture(e);
    return null;
  }
}

export async function getSubscribers(space: string) {
  try {
    const {
      data: { subscriptions }
    }: { data: { subscriptions: Subscription[] | null } } = await client.query({
      query: SUBSCRIPTIONS_QUERY,
      variables: {
        space
      }
    });
    return (subscriptions || []).map(subscription => subscription.address);
  } catch (e: any) {
    capture(e);
    return [];
  }
}
