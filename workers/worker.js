export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // ROOT / DATABASE TEST
    if (url.pathname === "/" || url.pathname === "/db-test") {
      try {
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);
        const result = await sql`
          SELECT NOW() AS current_time, version() AS db_version
        `;

        return json({
          success: true,
          message: "Successfully connected to Neon PostgreSQL!",
          data: result[0],
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // HEALTH CHECK
    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "Vezlivo API",
        status: "healthy",
      });
    }

    // SERVE MEDIA FROM R2
    if (url.pathname.startsWith("/media/")) {
      const filename = url.pathname.slice("/media/".length);

      if (!filename) {
        return new Response("Not found", { status: 404 });
      }

      try {
        const object = await env.R2.get(filename);

        if (!object) {
          return new Response("Media not found", { status: 404 });
        }

        const headers = new Headers(corsHeaders());
        object.writeHttpMetadata(headers);
        headers.set("ETag", object.httpEtag);

        return new Response(object.body, { headers });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // SYNC USER PROFILE
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
          onboardingCompletedAt,
        } = body;

        if (!uid) {
          return json({ success: false, error: "Missing user UID" }, 400);
        }

        let finalProfileURL = profileURL || "";

        if (profileImageBase64 && env.R2) {
          try {
            const base64Data = profileImageBase64.includes(",")
              ? profileImageBase64.split(",")[1]
              : profileImageBase64;

            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const filename =
              profileImageName || `profile-${uid}-${Date.now()}.jpg`;

            await env.R2.put(filename, bytes, {
              httpMetadata: { contentType: "image/jpeg" },
            });

            finalProfileURL = `${url.origin}/media/${filename}`;
          } catch (err) {
            console.error("R2 upload failed:", err);
          }
        }

        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

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

        await sql`
          INSERT INTO users (
            uid, display_name, username, birth_month, birth_day,
            birth_year, date_of_birth, age, is_minor, account_age_group,
            can_access_mature_content, profile_url,
            onboarding_complete, onboarding_completed_at
          )
          VALUES (
            ${uid}, ${displayName}, ${username}, ${birthMonth},
            ${birthDay}, ${birthYear}, ${dateOfBirth}, ${age},
            ${isMinor}, ${accountAgeGroup}, ${canAccessMatureContent},
            ${finalProfileURL}, ${onboardingComplete}, ${onboardingCompletedAt}
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
          message: "User profile synchronized successfully",
          profileURL: finalProfileURL,
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // SEARCH USERS
    if (
      (url.pathname === "/search/users" ||
        url.pathname === "/api/search/users") &&
      request.method === "GET"
    ) {
      try {
        const query = url.searchParams.get("q") || "";
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        const users = await sql`
          SELECT uid, display_name, username, profile_url
          FROM users
          WHERE username ILIKE ${"%" + query + "%"}
             OR display_name ILIKE ${"%" + query + "%"}
          LIMIT 20
        `;

        return json({ success: true, users });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // GET POSTS AND REELS (HOME FEED & PROFILE)
    if (
      [
        "/posts",
        "/api/posts",
        "/reels",
        "/api/reels",
      ].includes(url.pathname) &&
      request.method === "GET"
    ) {
      try {
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        const userId = url.searchParams.get("userId") || url.searchParams.get("uid");

        let posts;
        if (userId) {
          posts = await sql`
            SELECT * FROM posts 
            WHERE user_id = ${userId} 
            ORDER BY created_at DESC 
            LIMIT 50
          `;
        } else {
          posts = await sql`
            SELECT * FROM posts 
            ORDER BY created_at DESC 
            LIMIT 50
          `;
        }

        return json({
          success: true,
          posts,
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // CREATE POSTS AND REELS
    if (
      [
        "/posts",
        "/api/posts",
        "/posts/create",
        "/reels",
        "/api/reels",
        "/reels/create",
      ].includes(url.pathname) &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const {
          userId,
          uid,
          caption,
          muxAssetId,
          muxPlaybackId,
          thumbnailUrl,
          coverURL,
          videoUrl,
          mediaURL,
        } = body;

        const effectiveUserId = userId || uid;

        if (!effectiveUserId) {
          return json({
            success: false,
            error: "Missing userId or uid",
          }, 400);
        }

        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        await sql`
          CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            user_id TEXT,
            caption TEXT,
            video_url TEXT,
            mux_asset_id TEXT,
            mux_playback_id TEXT,
            thumbnail_url TEXT,
            likes_count INT DEFAULT 0,
            comments_count INT DEFAULT 0,
            shares_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        const result = await sql`
          INSERT INTO posts (
            user_id, caption, video_url, mux_asset_id,
            mux_playback_id, thumbnail_url
          )
          VALUES (
            ${effectiveUserId},
            ${caption || ""},
            ${videoUrl || mediaURL || ""},
            ${muxAssetId || ""},
            ${muxPlaybackId || ""},
            ${thumbnailUrl || coverURL || ""}
          )
          RETURNING *
        `;

        return json({
          success: true,
          message: "Post created successfully",
          post: result[0],
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // CREATE MUX DIRECT UPLOAD
    if (
      ["/mux/uploads", "/api/mux/uploads"].includes(url.pathname) &&
      request.method === "POST"
    ) {
      try {
        if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
          return json({
            success: false,
            error: "Mux credentials are not configured in Cloudflare environment variables.",
          }, 500);
        }

        const muxResponse = await fetch(
          "https://api.mux.com/video/v1/uploads",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(`${env.MUX_TOKEN_ID.trim()}:${env.MUX_TOKEN_SECRET.trim()}`),
            },
            body: JSON.stringify({
              cors_origin: "*",
              new_asset_settings: {
                playback_policies: ["public"],
              },
            }),
          }
        );

        const muxData = await muxResponse.json();

        if (!muxResponse.ok || !muxData.data?.url) {
          return json({
            success: false,
            error:
              muxData.error?.message ||
              "Failed to create Mux upload slot. Check Mux token permissions.",
          }, 502);
        }

        return json({
          success: true,
          uploadId: muxData.data.id,
          uploadUrl: muxData.data.url,
        }, 201);
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // CHECK MUX UPLOAD STATUS
    const completeMatch = url.pathname.match(
      /^\/mux\/uploads\/([^/]+)\/complete$/
    );

    if (completeMatch && request.method === "POST") {
      try {
        if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
          return json({
            success: false,
            error: "Mux credentials are not configured",
          }, 500);
        }

        const uploadId = decodeURIComponent(completeMatch[1]);

        const muxResponse = await fetch(
          `https://api.mux.com/video/v1/uploads/${encodeURIComponent(uploadId)}`,
          {
            headers: {
              Authorization:
                "Basic " +
                btoa(`${env.MUX_TOKEN_ID.trim()}:${env.MUX_TOKEN_SECRET.trim()}`),
            },
          }
        );

        const muxData = await muxResponse.json();

        if (!muxResponse.ok || !muxData.data) {
          return json({
            success: false,
            error: "Failed to check Mux upload status",
          }, 502);
        }

        const upload = muxData.data;
        let playbackId = "";
        let assetStatus = "processing";

        if (upload.asset_id) {
          const assetResponse = await fetch(
            `https://api.mux.com/video/v1/assets/${encodeURIComponent(upload.asset_id)}`,
            {
              headers: {
                Authorization:
                  "Basic " +
                  btoa(`${env.MUX_TOKEN_ID.trim()}:${env.MUX_TOKEN_SECRET.trim()}`),
              },
            }
          );

          const assetData = await assetResponse.json();

          if (assetResponse.ok && assetData.data) {
            playbackId =
              assetData.data.playback_ids?.[0]?.id || "";
            assetStatus = assetData.data.status || "processing";
          }
        }

        if (upload.status === "errored") {
          return json({
            success: false,
            status: upload.status,
            error: "Mux reports that the upload failed",
          }, 502);
        }

        return json({
          success: true,
          uploadId: upload.id,
          status: upload.status,
          assetId: upload.asset_id || null,
          playbackId,
          assetStatus,
          processing: assetStatus !== "ready",
          url: playbackId
            ? `https://stream.mux.com/${playbackId}.m3u8`
            : "",
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // STORIES
    if (
      ["/stories", "/api/stories"].includes(url.pathname) &&
      request.method === "POST"
    ) {
      return json({
        success: true,
        storyId: Date.now().toString(),
      });
    }

    return json({
      ok: false,
      error: "Route not found",
      path: url.pathname,
      method: request.method,
    }, 404);
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Upload-Length, Upload-Metadata, Tus-Resumable, Upload-Offset, X-HTTP-Method-Override",
    "Access-Control-Expose-Headers":
      "Location, Upload-Offset, Upload-Length, Tus-Resumable, Upload-Metadata",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}