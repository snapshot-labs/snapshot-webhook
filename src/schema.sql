CREATE TABLE subscriptions (
  guild VARCHAR(64) NOT NULL,
  channel VARCHAR(64) NOT NULL,
  space VARCHAR(64) NOT NULL,
  mention VARCHAR(64) NOT NULL,
  created VARCHAR(64) NOT NULL,
  updated VARCHAR(64) NOT NULL,
  PRIMARY KEY (guild, channel, space),
  INDEX created (created),
  INDEX updated (updated)
);

CREATE TABLE notificationSubscriptions (
  id VARCHAR(66) NOT NULL,
  ipfs VARCHAR(64) NOT NULL,
  address VARCHAR(64) NOT NULL,
  space VARCHAR(64) NOT NULL,
  created INT(11) NOT NULL,
  PRIMARY KEY (address, space),
  INDEX ipfs (ipfs),
  INDEX created (created)
);

CREATE TABLE events (
  id VARCHAR(128) NOT NULL,
  event VARCHAR(64) NOT NULL,
  space VARCHAR(64) NOT NULL,
  expire INT(11) NOT NULL,
  PRIMARY KEY (id, event),
  INDEX space (space),
  INDEX expire (expire)
);
