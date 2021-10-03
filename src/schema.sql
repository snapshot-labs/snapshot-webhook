CREATE TABLE subscriptions (
  guild VARCHAR(64) NOT NULL,
  channel VARCHAR(64) NOT NULL,
  space VARCHAR(64) NOT NULL,
  mention VARCHAR(64) NOT NULL,
  PRIMARY KEY (guild, channel, space)
);
