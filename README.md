# Snapshot webhook

Microservice to send Snapshot related notifications to multiple communication channels.

### Requirements

- Node.js 22.6+
- PostgreSQL 14+

### Get started

- Fork this repository then run this command to install dependencies:

```shell
yarn install
```

- Create a PostgreSQL database then setup a new file `.env` with the PostgreSQL connection string (the app applies its own migrations at startup):

```dotenv
DATABASE_URL=postgres://...
HUB_URL=https://hub.snapshot.org # Use https://testnet.hub.snapshot.org for the demo instance
SERVICE_EVENTS=1
```

- Set the replay cursor (the app refuses to start without it, to prevent an accidental full-history replay). This applies the migrations and sets `last_mci` to the given value, creating or overwriting it — use it to seed a fresh database or to resume from a specific MCI during a cutover:

```shell
yarn db:set-mci <mci>
```

- Fresh install: set `<mci>` to the hub's current MCI — query `{ messages(first: 1, orderBy: "mci", orderDirection: desc) { mci } }` on `<HUB_URL>/graphql`. Using `0` replays the entire hub history.

- After each schema change (`src/schema.ts`), run `yarn db:generate` to generate the matching migration.

- Comment line(s) on [this file](src/providers/index.ts) to disable provider(s).

- Run the `dev` script to start the server

```shell
yarn dev
```

### Testing

- Run `yarn test`. Requires a local PostgreSQL database named `snapshot_webhook_test` (connection defaults in `test/.env.test`) — migrations are applied automatically before the suite runs.

### Add a provider

Create a new file with the name of the provider in the folder `./src/providers` and expose a method `send` following the same format than on others files in the same folder. Then add the provider in the file `./src/providers/index`.

[MIT](LICENSE).
