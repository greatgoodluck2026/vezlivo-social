import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://Vezlivo_owner:npg_V7QkhJ3bilSm@ep-weathered-star-zajg5it9-pooler.c-2.eu-west-2.aws.neon.tech/Vezlivo?sslmode=require&channel_binding=require');
async function main() {
  console.log('Creating tables...');
  
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      media_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log('Tables created successfully!');
}

main().catch(console.error);