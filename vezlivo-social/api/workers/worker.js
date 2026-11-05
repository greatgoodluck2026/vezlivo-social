export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // Root route tests the database directly
    if (url.pathname === "/") {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(env.DATABASE_URL);
        const result = await sql`SELECT NOW() as current_time, version() as db_version`;
        
        return json({
          success: true,
          message: 'Successfully connected to Neon PostgreSQL!',
          data: result[0]
        });
      } catch (err) {
        return json({
          success: false,
          error: err.message
        }, 500);
      }
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "Vezlivo API",
        status: "healthy",
      });
    }

    if (url.pathname === "/db-test") {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(env.DATABASE_URL);
        const result = await sql`SELECT NOW() as current_time, version() as db_version`;
        
        return json({
          success: true,
          message: 'Successfully connected to Neon PostgreSQL!',
          data: result[0]
        });
      } catch (err) {
        return json({
          success: false,
          error: err.message
        }, 500);
      }
    }

    // ==========================================
    // R2 MEDIA SERVING ROUTE
    // ==========================================
    if (url.pathname.startsWith("/media/")) {
      const filename = url.pathname.replace("/media/", "");
      if (!filename) {
        return new Response("Not found", { status: 404 });
      }

      try {
        const object = await env.R2.get(filename);
        if (!object) {
          return new Response("Image not found in R2", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        corsHeaders() && Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

        return new Response(object.body, {
          headers,
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // ==========================================
    // USER PROFILE SYNC ROUTE (Neon + R2)
    // ==========================================
    if (url.pathname === "/users/sync" && request.method === "POST") {
      try {
        const body = await request.json();
        const {
          uid,
          displayName,
          username,
          birthMonth,
          birthDay,
          birthYear,
          dateOfBirth,
          age,
          isMinor,
          accountAgeGroup,
          canAccessMatureContent,
          profileURL,
          profileImageBase64,
          profileImageName,
          onboardingComplete,
          onboardingCompletedAt
        } = body;

        if (!uid) {
          return json({ success: false, error: "Missing user UID" }, 400);
        }

        let finalProfileURL = profileURL || "";

        // Handle Base64 Profile Picture Upload to Cloudflare R2
        if (profileImageBase64 && env.R2) {
          try {
            const base64Data = profileImageBase64.includes(",")
              ? profileImageBase64.split(",")[1]
              : profileImageBase64;

            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const fileName = profileImageName || `profile-${uid}-${Date.now()}.jpg`;

            // Upload directly to Cloudflare R2 bucket
            await env.R2.put(fileName, bytes, {
              httpMetadata: { contentType: "image/jpeg" },
            });

            // Construct public URL through worker media route
            finalProfileURL = `${url.origin}/media/${fileName}`;
          } catch (r2Error) {
            console.error("R2 Upload failed:", r2Error);
            // Fallback to existing profileURL if R2 fails
          }
        }

        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(env.DATABASE_URL);

        // Ensure users table exists matching Vezlivo's onboarding structure
        await sql`
          CREATE TABLE IF NOT EXISTS users (
            uid TEXT PRIMARY KEY,
            display_name TEXT,
            username TEXT,
            birth_month INT,
            birth_day INT,
            birth_year INT,
            date_of_birth TEXT,
            age INT,
            is_minor BOOLEAN,
            account_age_group TEXT,
            can_access_mature_content BOOLEAN,
            profile_url TEXT,
            onboarding_complete BOOLEAN,
            onboarding_completed_at BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        // Upsert user data into Neon PostgreSQL
        await sql`
          INSERT INTO users (
            uid, display_name, username, birth_month, birth_day, birth_year,
            date_of_birth, age, is_minor, account_age_group,
            can_access_mature_content, profile_url, onboarding_complete, onboarding_completed_at
          ) VALUES (
            ${uid}, ${displayName}, ${username}, ${birthMonth}, ${birthDay}, ${birthYear},
            ${dateOfBirth}, ${age}, ${isMinor}, ${accountAgeGroup},
            ${canAccessMatureContent}, ${finalProfileURL}, ${onboardingComplete}, ${onboardingCompletedAt}
          )
          ON CONFLICT (uid) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            username = EXCLUDED.username,
            birth_month = EXCLUDED.birth_month,
            birth_day = EXCLUDED.birth_day,
            birth_year = EXCLUDED.birth_year,
            date_of_birth = EXCLUDED.date_of_birth,
            age = EXCLUDED.age,
            is_minor = EXCLUDED.is_minor,
            account_age_group = EXCLUDED.account_age_group,
            can_access_mature_content = EXCLUDED.can_access_mature_content,
            profile_url = EXCLUDED.profile_url,
            onboarding_complete = EXCLUDED.onboarding_complete,
            onboarding_completed_at = EXCLUDED.onboarding_completed_at
        `;

        return json({
          success: true,
          message: "User profile synchronized successfully to Neon PostgreSQL & R2",
          profileURL: finalProfileURL
        });
      } catch (err) {
        return json({
          success: false,
          error: err.message
        }, 500);
      }
    }

    return json(
      {
        ok: false,
        error: "Route not found",
      },
      404
    );
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}