# Snapshot webhook

Microservice to send Snapshot related notifications to multiple communication channels. 

### Get started

- Fork this repository then run this command to install dependencies: 
```shell
yarn install
```

- Create a MySQL database then setup a new file `.env` with the MySQL connection string:

```dotenv
DATABASE_URL=mysql://...
HUB_URL=https://hub.snapshot.org # Use https://testnet.snapshot.org for the demo instance
SERVICE_EVENTS=1
```

- Run [this MySQL query](src/helpers/schema.sql) to create tables on the database.

- Comment line(s) on [this file](src/providers/index.ts) to disable provider(s).

- Run the `dev` script to start the server
```shell
yarn dev
```

### Add a provider

Create a new file with the name of the provider in the folder `./src/providers` and expose a method `send` following the same format than on others files in the same folder. Then add the provider in the file `./src/providers/index`.

[MIT](LICENSE).
