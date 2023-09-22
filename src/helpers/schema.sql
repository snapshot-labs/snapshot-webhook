CREATE TABLE _metadatas (
  id VARCHAR(20) NOT NULL,
  value VARCHAR(128) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE events (
  id VARCHAR(256) NOT NULL,
  event VARCHAR(64) NOT NULL,
  space VARCHAR(256) NOT NULL,
  expire INT(11) NOT NULL,
  PRIMARY KEY (id, event),
  INDEX space (space),
  INDEX expire (expire)
);

# Webhook provider
CREATE TABLE subscribers (
  id INT NOT NULL AUTO_INCREMENT,
  owner VARCHAR(256) NOT NULL,
  url TEXT NOT NULL,
  method VARCHAR(5) NOT NULL DEFAULT 'POST',
  space VARCHAR(256) NOT NULL,
  active INT(11) NOT NULL DEFAULT 1,
  created INT(11) NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  PRIMARY KEY (id),
  INDEX owner (owner),
  INDEX space (space),
  INDEX active (active),
  INDEX created (created)
);

# Discord provider
CREATE TABLE subscriptions (
  guild VARCHAR(64) NOT NULL,
  channel VARCHAR(64) NOT NULL,
  space VARCHAR(256) NOT NULL,
  mention VARCHAR(64) NOT NULL,
  created VARCHAR(64) NOT NULL,
  updated VARCHAR(64) NOT NULL,
  PRIMARY KEY (guild, channel, space),
  INDEX created (created),
  INDEX updated (updated)
);

# XMTP provider
CREATE TABLE xmtp (
  address VARCHAR(256) NOT NULL,
  status INT(1) NOT NULL,
  PRIMARY KEY (address),
  INDEX status (status)
);
