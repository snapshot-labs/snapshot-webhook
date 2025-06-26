#!/usr/bin/env ts-node

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../src/helpers/mysql';

async function createTables() {
  console.log('Creating database tables...');

  try {
    // Read schema file
    const schemaPath = join(__dirname, '../src/helpers/schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    // Remove comments and split by semicolon
    const cleanedSchema = schema
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('--'))
      .join('\n');

    const statements = cleanedSchema
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/) // Split respecting quoted strings
      .map(stmt => stmt.trim())
      .filter(stmt => stmt);

    // Execute each CREATE TABLE statement
    for (const statement of statements) {
      if (statement.toUpperCase().includes('CREATE TABLE')) {
        try {
          await db.queryAsync(statement);
          const tableName = statement.match(/CREATE TABLE (\w+)/i)?.[1];
          console.log(`✓ Table ${tableName} created or already exists`);
        } catch (error: any) {
          if (error.code === 'ER_TABLE_EXISTS_ERROR') {
            const tableName = statement.match(/CREATE TABLE (\w+)/i)?.[1];
            console.log(`✓ Table ${tableName} already exists`);
          } else {
            console.error('Error creating table:', error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error reading schema file or creating tables:', error);
  }
}

async function initLastMci() {
  console.log('Initializing last_mci metadata...');

  try {
    // Check if last_mci already exists
    const checkQuery = 'SELECT value FROM _metadatas WHERE id = ? LIMIT 1';
    const existing = await db.queryAsync(checkQuery, ['last_mci']);

    if (existing && existing.length > 0) {
      console.log('✓ last_mci already exists with value:', existing[0].value);
      return;
    }

    // Insert initial last_mci value
    const insertQuery = 'INSERT INTO _metadatas (id, value) VALUES (?, ?)';
    await db.queryAsync(insertQuery, ['last_mci', '0']);

    console.log('✓ Successfully initialized last_mci with value: 0');
  } catch (error) {
    console.error('Error initializing last_mci:', error);
  }
}

async function setup() {
  console.log('Starting database setup...\n');

  await createTables();
  console.log('');
  await initLastMci();

  console.log('\nDatabase setup completed!');
  process.exit(0);
}

setup();
