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
// SERVE FILES FROM CLOUDFARE R2 (/media/*)
    const mediaMatch = url.pathname.match(/^\/media\/(.+)$/);
    if (mediaMatch && request.method === "GET") {
      try {
        const filename = decodeURIComponent(mediaMatch[1]);
        if (!env.R2) {
          return new Response("R2 storage not configured", { status: 500 });
        }
        
        const object = await env.R2.get(filename);
        if (!object) {
          return new Response("File not found", { status: 404 });
        }

        const headers = new Headers(corsHeaders());
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        
        return new Response(object.body, { headers });
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

    // SOUNDS ENDPOINT
    if (["/sounds", "/api/sounds"].includes(url.pathname) && request.method === "GET") {
      return json({
        success: true,
        sounds: [],
      });
    }

// COMMENTS ENDPOINT (GET & POST)
    if (url.pathname === "/comments") {
      try {
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        // Ensure comments table exists with media_urls column
        await sql`
          CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            post_id TEXT NOT NULL,
            post_owner_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            text TEXT,
            media_urls TEXT[],
            parent_id TEXT,
            created_at BIGINT
          )
        `;

        // Ensure columns exist if table was already created previously
        await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id TEXT;`;
        await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_urls TEXT[];`;

        // GET Comments for a post (with dynamic user profile joining)
        if (request.method === "GET" && url.pathname === "/comments") {
          const postId = url.searchParams.get("postId");
          if (!postId) {
            return json({ success: false, error: "Missing postId" }, 400);
          }

          const comments = await sql`
            SELECT 
              c.id, 
              c.post_id, 
              c.user_id, 
              COALESCE(u.display_name, c.display_name, 'Vezlivo User') AS display_name,
              COALESCE(u.username, c.username, 'user') AS username,
              COALESCE(u.profile_url, u.photo_url, c.profile_url, c.photo_url, '') AS photo_url,
              c.text, 
              c.media_urls,
              c.parent_id, 
              c.created_at 
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.uid
            WHERE c.post_id = ${postId} 
            ORDER BY c.created_at ASC
          `;

          const formattedComments = comments.map(c => ({
            id: c.id,
            commentId: c.id,
            postId: c.post_id,
            userId: c.user_id,
            user_id: c.user_id,
            displayName: c.display_name,
            display_name: c.display_name,
            username: c.username,
            photoURL: c.photo_url,
            profile_url: c.photo_url,
            text: c.text,
            mediaUrls: c.media_urls || [],
            media_urls: c.media_urls || [],
            parentId: c.parent_id,
            parent_id: c.parent_id,
            createdAt: c.created_at
          }));

          return json({ success: true, comments: formattedComments });
        }

        // POST Comments
        if (request.method === "POST") {
          const body = await request.json();
          const { postId, postOwnerId, userId, text, mediaUrls, media_urls, parentId, parent_id } = body;
          const effectiveParentId = parentId || parent_id || null;
          const imagesArray = mediaUrls || media_urls || [];

          // Fixed: Allow comment if either text OR images are provided!
          if (!postId || !userId || (!text && imagesArray.length === 0)) {
            return json({ success: false, error: "Missing required fields (text or image required)" }, 400);
          }

          const trimmedText = typeof text === "string" ? text.trim() : "";
          
          if (trimmedText) {
            if (trimmedText.length > 500) {
              return json({ success: false, error: "Comment is too long (maximum 500 characters)." }, 400);
            }

            const cleanedText = trimmedText
              .toLowerCase()
              .replace(/[^\p{L}\p{N}\s]/gu, " ")
              .replace(/\s+/g, " ")
              .trim();

            const blockedWords = ["badword", "badword2", "badword3", "idiot", "stupid", "fool", "dumb"];
            const words = cleanedText.split(" ");
            if (words.some((word) => blockedWords.includes(word))) {
              return json({ success: false, error: "This comment contains language that is not allowed on Vezlivo." }, 400);
            }

            if (/(.)\1{7,}/i.test(cleanedText)) {
              return json({ success: false, error: "Please do not send repeated or spam characters." }, 400);
            }
          }

          await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0`;
          await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments INT DEFAULT 0`;

          const createdAt = Date.now();

          // Save comment with media URLs into Neon PostgreSQL
          const insertRes = await sql`
            INSERT INTO comments (post_id, post_owner_id, user_id, text, media_urls, parent_id, created_at)
            VALUES (${postId}, ${postOwnerId || ""}, ${userId}, ${trimmedText}, ${imagesArray}, ${effectiveParentId}, ${createdAt})
            RETURNING id
          `;

          const newCommentId = insertRes[0]?.id;

          if (!isNaN(postId)) {
            await sql`
              UPDATE posts 
              SET comments_count = COALESCE(comments_count, 0) + 1,
                  comments = COALESCE(comments, 0) + 1
              WHERE id = ${parseInt(postId, 10)}
            `;
          } else {
            await sql`
              UPDATE posts 
              SET comments_count = COALESCE(comments_count, 0) + 1,
                  comments = COALESCE(comments, 0) + 1
              WHERE id::text = ${postId}
            `;
          }

          let targetUserId = postOwnerId;
          let activityType = "comment";

          if (effectiveParentId) {
            const parentRes = await sql`SELECT user_id FROM comments WHERE id::text = ${effectiveParentId} OR id = ${effectiveParentId}`;
            if (parentRes.length > 0 && parentRes[0].user_id) {
              targetUserId = parentRes[0].user_id;
              activityType = "reply";
            }
          }

          if (targetUserId && targetUserId !== userId) {
            const userRes = await sql`SELECT display_name, username FROM users WHERE uid = ${userId}`;
            const actorName = userRes[0]?.display_name || userRes[0]?.username || "Someone";

            const postRes = await sql`SELECT thumbnail_url, video_url, mux_playback_id FROM posts WHERE id::text = ${postId}`;
            let thumbnail = null;
            if (postRes.length > 0) {
              const playbackId = postRes[0].mux_playback_id;
              thumbnail = playbackId 
                ? `https://image.mux.com/${playbackId}/thumbnail.jpg` 
                : (postRes[0].thumbnail_url || postRes[0].video_url || null);
            }

            await sql`
              CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                user_uid TEXT NOT NULL,
                type VARCHAR(50) NOT NULL,
                actor_id TEXT,
                actor_name TEXT,
                comment_text TEXT,
                post_id TEXT,
                post_thumbnail TEXT,
                read BOOLEAN DEFAULT FALSE,
                created_at BIGINT
              )
            `;

            await sql`
              INSERT INTO activities (user_uid, type, actor_id, actor_name, comment_text, post_id, post_thumbnail, read, created_at)
              VALUES (${targetUserId}, ${activityType}, ${userId}, ${actorName}, ${trimmedText || '[Image]'}, ${postId}, ${thumbnail}, FALSE, ${createdAt})
            `;
          }

          return json({ success: true, message: "Comment added successfully", commentId: newCommentId });
        }
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }
    // SYNC USER PROFILE & IMAGES
    if (
      [
        "/users/sync",
        "/api/users/sync",
        "/users/update-profile",
        "/api/users/update-profile",
        "/rs/update-profile",
        "/api/rs/update-profile"
      ].includes(url.pathname) &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const {
          uid,
          displayName,
          display_name,
          username,
          bio,
          isPrivate,
          is_private,
          profileURL,
          profile_url,
          coverURL,
          cover_url,
          profileImageBase64,
          profileImageName,
          coverImageBase64,
          coverImageName,
          birthMonth,
          birthDay,
          birthYear,
          dateOfBirth,
          age,
          isMinor,
          accountAgeGroup,
          canAccessMatureContent,
          onboardingComplete,
          onboardingCompletedAt,
        } = body;

        if (!uid) {
          return json({ success: false, error: "Missing user UID" }, 400);
        }

        let finalProfileURL = profile_url || profileURL || "";
        let finalCoverURL = cover_url || coverURL || "";

        // Handle Profile Picture R2 Upload
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
            console.error("Profile R2 upload failed, falling back to direct URL/payload:", err);
          }
        } else if (!finalProfileURL && profileImageBase64) {
          // Fallback if R2 is not bound so it doesn't drop the image
          finalProfileURL = profileImageBase64;
        }
        // Handle Cover Picture R2 Upload
        if (coverImageBase64 && env.R2) {
          try {
            const base64Data = coverImageBase64.includes(",")
              ? coverImageBase64.split(",")[1]
              : coverImageBase64;

            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const filename =
              coverImageName || `cover-${uid}-${Date.now()}.jpg`;

            await env.R2.put(filename, bytes, {
              httpMetadata: { contentType: "image/jpeg" },
            });

            finalCoverURL = `${url.origin}/media/${filename}`;
          } catch (err) {
            console.error("Cover R2 upload failed:", err);
          }
        }

        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        await sql`
          CREATE TABLE IF NOT EXISTS users (
            uid TEXT PRIMARY KEY,
            display_name TEXT,
            username TEXT,
            bio TEXT,
            is_private BOOLEAN DEFAULT FALSE,
            profile_url TEXT,
            cover_url TEXT,
            birth_month INT,
            birth_day INT,
            birth_year INT,
            date_of_birth TEXT,
            age INT,
            is_minor BOOLEAN,
            account_age_group TEXT,
            can_access_mature_content BOOLEAN,
            can_go_live BOOLEAN DEFAULT FALSE,
            can_join_live BOOLEAN DEFAULT FALSE,
            content_maturity_rating VARCHAR(20) DEFAULT 'mature',
            onboarding_complete BOOLEAN,
            onboarding_completed_at BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_url TEXT`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth TEXT`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS age INT`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_minor BOOLEAN`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS can_go_live BOOLEAN DEFAULT FALSE`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS can_join_live BOOLEAN DEFAULT FALSE`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS content_maturity_rating VARCHAR(20) DEFAULT 'mature'`;

        const calculatedAge = typeof age === 'number' ? age : (age ? parseInt(age, 10) : 18);
        const derivedIsMinor = calculatedAge < 18;
        const derivedCanGoLive = !derivedIsMinor;
        const derivedCanJoinLive = !derivedIsMinor;
        const derivedMaturityRating = derivedIsMinor ? 'teen' : 'mature';
        const effectiveDisplayName = displayName || display_name || "";
        const effectiveIsPrivate = isPrivate === true || is_private === true;

        await sql`
          INSERT INTO users (
            uid, display_name, username, bio, is_private, profile_url, cover_url,
            birth_month, birth_day, birth_year, date_of_birth, age, is_minor,
            account_age_group, can_access_mature_content, can_go_live, can_join_live,
            content_maturity_rating, onboarding_complete, onboarding_completed_at
          )
          VALUES (
            ${uid}, ${effectiveDisplayName}, ${username || ""}, ${bio || ""}, ${effectiveIsPrivate},
            ${finalProfileURL}, ${finalCoverURL}, ${birthMonth || null}, ${birthDay || null},
            ${birthYear || null}, ${dateOfBirth || null}, ${calculatedAge}, ${derivedIsMinor},
            ${accountAgeGroup || (derivedIsMinor ? 'minor' : 'adult')}, ${canAccessMatureContent ?? !derivedIsMinor},
            ${derivedCanGoLive}, ${derivedCanJoinLive}, ${derivedMaturityRating},
            ${onboardingComplete || false}, ${onboardingCompletedAt || null}
          )
          ON CONFLICT (uid) DO UPDATE SET
            display_name = COALESCE(EXCLUDED.display_name, users.display_name),
            username = COALESCE(EXCLUDED.username, users.username),
            bio = COALESCE(EXCLUDED.bio, users.bio),
            is_private = COALESCE(EXCLUDED.is_private, users.is_private),
            profile_url = CASE WHEN EXCLUDED.profile_url IS NOT NULL AND EXCLUDED.profile_url != '' THEN EXCLUDED.profile_url ELSE users.profile_url END,
            cover_url = CASE WHEN EXCLUDED.cover_url IS NOT NULL AND EXCLUDED.cover_url != '' THEN EXCLUDED.cover_url ELSE users.cover_url END,
            date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
            age = COALESCE(EXCLUDED.age, users.age),
            is_minor = COALESCE(EXCLUDED.is_minor, users.is_minor),
            can_go_live = COALESCE(EXCLUDED.can_go_live, users.can_go_live),
            can_join_live = COALESCE(EXCLUDED.can_join_live, users.can_join_live),
            content_maturity_rating = COALESCE(EXCLUDED.content_maturity_rating, users.content_maturity_rating),
            onboarding_complete = COALESCE(EXCLUDED.onboarding_complete, users.onboarding_complete)
        `;

        if (finalProfileURL) {
          await sql`
            UPDATE posts 
            SET profile_url = ${finalProfileURL} 
            WHERE user_id = ${uid}
          `;
        }

       return json({
          success: true,
          message: "User profile synchronized successfully with age rules",
          profileURL: finalProfileURL,
          coverURL: finalCoverURL,
          canGoLive: derivedCanGoLive,
          canJoinLive: derivedCanJoinLive,
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

   // GET USER PROFILE ROUTE (Auto-creates user row if missing to prevent 404)
    const userProfileMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/) || url.pathname.match(/^\/users\/([^/]+)$/);
    if (userProfileMatch && request.method === "GET") {
      try {
        const uid = decodeURIComponent(userProfileMatch[1]);
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        let users = await sql`
          SELECT uid, display_name, username, bio, 
                 COALESCE(profile_url, photo_url, '') AS profile_url, 
                 COALESCE(photo_url, profile_url, '') AS photo_url,
                 cover_url, followers_count, following_count, is_private 
          FROM users 
          WHERE uid = ${uid}
        `;

        // If the user row does not exist in Neon yet, create it automatically
        if (users.length === 0) {
          await sql`
            INSERT INTO users (uid, display_name, username, bio, profile_url, photo_url, created_at)
            VALUES (${uid}, 'Vezlivo User', ${'user_' + uid.substring(0, 6)}, '', '', '', NOW())
            ON CONFLICT (uid) DO NOTHING
          `;
          
          users = await sql`
            SELECT uid, display_name, username, bio, 
                   COALESCE(profile_url, photo_url, '') AS profile_url, 
                   COALESCE(photo_url, profile_url, '') AS photo_url,
                   cover_url, followers_count, following_count, is_private 
            FROM users 
            WHERE uid = ${uid}
          `;
        }

        const u = users[0] || {};
        return json({
          success: true,
          profile: {
            uid: u.uid || uid,
            displayName: u.display_name || "Vezlivo User",
            username: u.username || "user",
            bio: u.bio || "",
            profileURL: u.profile_url || u.photo_url || "",
            photoURL: u.photo_url || u.profile_url || "",
            coverURL: u.cover_url || "",
            followersCount: u.followers_count || 0,
            followingCount: u.following_count || 0,
            isPrivate: u.is_private || false,
          },
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

    // GET POSTS AND REELS
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

        const posts = await sql`
          SELECT p.*, 
                 COALESCE(u.display_name, p.display_name, 'Vezlivo User') AS display_name, 
                 COALESCE(u.username, p.username, '@user') AS username, 
                 COALESCE(u.profile_url, u.photo_url, p.profile_url, '') AS profile_url,
                 COALESCE(u.profile_url, u.photo_url, p.profile_url, '') AS "profileURL"
          FROM posts p
          LEFT JOIN users u ON p.user_id = u.uid
          ORDER BY p.created_at DESC 
          LIMIT 50
        `;

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
          displayName,
          username,
          profileURL,
          userPhotoURL,
          caption,
          videoUrl,
          mediaURL,
          thumbnailUrl,
          muxAssetId,
          muxPlaybackId,
          isMature,
          category,
          coverURL,
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

        const userQuery = await sql`SELECT profile_url, display_name, username FROM users WHERE uid = ${effectiveUserId}`;
        const dbUser = userQuery[0] || {};

        const effectiveProfileUrl = dbUser.profile_url || profileURL || userPhotoURL || "";
        const effectiveDisplayName = dbUser.display_name || displayName || "Vezlivo User";
        const effectiveUsername = dbUser.username || username || "@user";

        await sql`
          CREATE TABLE IF NOT EXISTS posts (
            id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id TEXT,
            display_name TEXT,
            username TEXT,
            profile_url TEXT,
            caption TEXT,
            video_url TEXT,
            mux_asset_id TEXT,
            mux_playback_id TEXT,
            thumbnail_url TEXT,
            is_mature BOOLEAN DEFAULT FALSE,
            category VARCHAR(50) DEFAULT 'general',
            likes_count INT DEFAULT 0,
            comments_count INT DEFAULT 0,
            shares_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        let finalVideoUrl = videoUrl || mediaURL || "";
        const finalMuxPlaybackId = muxPlaybackId || "";

        if ((!finalVideoUrl || finalVideoUrl.trim() === "") && finalMuxPlaybackId) {
          finalVideoUrl = `https://stream.mux.com/${finalMuxPlaybackId}/high.mp4`;
        }

        let finalThumbnailUrl = thumbnailUrl || coverURL || "";
        if (!finalThumbnailUrl && finalMuxPlaybackId) {
          finalThumbnailUrl = `https://image.mux.com/${finalMuxPlaybackId}/thumbnail.jpg`;
        }

        const result = await sql`
          INSERT INTO posts (
            user_id, display_name, username, profile_url, 
            caption, video_url, mux_asset_id,
            mux_playback_id, thumbnail_url, is_mature, category
          )
          VALUES (
            ${effectiveUserId},
            ${effectiveDisplayName},
            ${effectiveUsername},
            ${effectiveProfileUrl},
            ${caption || ""},
            ${finalVideoUrl},
            ${muxAssetId || ""},
            ${finalMuxPlaybackId},
            ${finalThumbnailUrl},
            ${isMature || false},
            ${category || 'general'}
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

    // TOGGLE FOLLOW / UNFOLLOW ENDPOINT
    if (
      url.pathname === "/follow" ||
      url.pathname === "/api/follow" ||
      url.pathname === "/users/follow" ||
      url.pathname === "/api/users/follow" ||
      url.pathname.endsWith("/follow")
    ) {
      if (request.method !== "POST") {
        return json({ success: false, error: "Method not allowed" }, 405);
      }

      try {
        const body = await request.json();
        const { followerId, followingId, action } = body;

        if (!followerId || !followingId) {
          return json({ success: false, error: "Missing followerId or followingId" }, 400);
        }

        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        if (action === "unfollow") {
          await sql`
            DELETE FROM follows 
            WHERE follower_id = ${followerId} AND following_id = ${followingId}
          `;
          await sql`
            UPDATE users 
            SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) 
            WHERE uid = ${followerId}
          `;
          await sql`
            UPDATE users 
            SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0) 
            WHERE uid = ${followingId}
          `;
        } else {
          await sql`
            INSERT INTO follows (follower_id, following_id) 
            VALUES (${followerId}, ${followingId}) 
            ON CONFLICT (follower_id, following_id) DO NOTHING
          `;
          await sql`
            UPDATE users 
            SET following_count = COALESCE(following_count, 0) + 1 
            WHERE uid = ${followerId}
          `;
          await sql`
            UPDATE users 
            SET followers_count = COALESCE(followers_count, 0) + 1 
            WHERE uid = ${followingId}
          `;

          // Record follow activity in Neon PostgreSQL
          const userRes = await sql`SELECT display_name, username FROM users WHERE uid = ${followerId}`;
          const actorName = userRes[0]?.display_name || userRes[0]?.username || "Someone";
          
          await sql`
            CREATE TABLE IF NOT EXISTS activities (
              id SERIAL PRIMARY KEY,
              user_uid TEXT NOT NULL,
              type VARCHAR(50) NOT NULL,
              actor_id TEXT,
              actor_name TEXT,
              comment_text TEXT,
              post_id TEXT,
              post_thumbnail TEXT,
              read BOOLEAN DEFAULT FALSE,
              created_at BIGINT
            )
          `;
          await sql`
            INSERT INTO activities (user_uid, type, actor_id, actor_name, read, created_at)
            VALUES (${followingId}, 'follow', ${followerId}, ${actorName}, FALSE, ${Date.now()})
          `;
        }

        return json({ success: true, message: "Follow updated successfully" });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // TOGGLE LIKE / UNLIKE ENDPOINT (Automatically triggers activity notification in Neon)
    if (
      url.pathname === "/like" ||
      url.pathname === "/api/like" ||
      url.pathname === "/posts/like" ||
      url.pathname === "/api/posts/like" ||
      url.pathname.endsWith("/like")
    ) {
      if (request.method !== "POST") {
        return json({ success: false, error: "Method not allowed" }, 405);
      }

      try {
        const body = await request.json();
        const { userId, postId, action } = body;

        if (!userId || !postId) {
          return json({ success: false, error: "Missing userId or postId" }, 400);
        }

        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        await sql`
          CREATE TABLE IF NOT EXISTS likes (
            user_id VARCHAR(128) NOT NULL,
            post_id VARCHAR(128) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
          )
        `;
        await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0`;

        if (action === "unlike") {
          await sql`
            DELETE FROM likes 
            WHERE user_id = ${userId} AND post_id = ${postId}
          `;
          await sql`
            UPDATE posts 
            SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
            WHERE id::text = ${postId}
          `;
        } else {
          await sql`
            INSERT INTO likes (user_id, post_id) 
            VALUES (${userId}, ${postId}) 
            ON CONFLICT (user_id, post_id) DO NOTHING
          `;
          await sql`
            UPDATE posts 
            SET likes_count = COALESCE(likes_count, 0) + 1 
            WHERE id::text = ${postId}
          `;

          // Automatically record like activity with correct Mux thumbnail for the video owner in Neon PostgreSQL
          const postRes = await sql`SELECT user_id, thumbnail_url, video_url, mux_playback_id FROM posts WHERE id::text = ${postId}`;
          if (postRes.length > 0) {
            const ownerId = postRes[0].user_id;
            if (ownerId && ownerId !== userId) {
              const userRes = await sql`SELECT display_name, username FROM users WHERE uid = ${userId}`;
              const actorName = userRes[0]?.display_name || userRes[0]?.username || "Someone";

              const playbackId = postRes[0].mux_playback_id;
              const thumbnail = playbackId 
                ? `https://image.mux.com/${playbackId}/thumbnail.jpg` 
                : (postRes[0].thumbnail_url || postRes[0].video_url || null);

              await sql`
                CREATE TABLE IF NOT EXISTS activities (
                  id SERIAL PRIMARY KEY,
                  user_uid TEXT NOT NULL,
                  type VARCHAR(50) NOT NULL,
                  actor_id TEXT,
                  actor_name TEXT,
                  comment_text TEXT,
                  post_id TEXT,
                  post_thumbnail TEXT,
                  read BOOLEAN DEFAULT FALSE,
                  created_at BIGINT
                )
              `;
              await sql`
                INSERT INTO activities (user_uid, type, actor_id, actor_name, post_id, post_thumbnail, read, created_at)
                VALUES (${ownerId}, 'like', ${userId}, ${actorName}, ${postId}, ${thumbnail}, FALSE, ${Date.now()})
              `;
            }
          }
        }

        return json({ success: true, message: "Like updated successfully" });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // TOGGLE SAVE / FAVORITE ENDPOINT
    if (
      url.pathname === "/save" ||
      url.pathname === "/api/save" ||
      url.pathname === "/posts/save" ||
      url.pathname === "/api/posts/save" ||
      url.pathname.endsWith("/save")
    ) {
      if (request.method !== "POST") {
        return json({ success: false, error: "Method not allowed" }, 405);
      }

      try {
        const body = await request.json();
        const { userId, postId, action } = body;

        if (!userId || !postId) {
          return json({ success: false, error: "Missing userId or postId" }, 400);
        }

        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        await sql`
          CREATE TABLE IF NOT EXISTS saves (
            user_id VARCHAR(128) NOT NULL,
            post_id VARCHAR(128) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
          )
        `;

        if (action === "unsave") {
          await sql`
            DELETE FROM saves 
            WHERE user_id = ${userId} AND post_id = ${postId}
          `;
        } else {
          await sql`
            INSERT INTO saves (user_id, post_id) 
            VALUES (${userId}, ${postId}) 
            ON CONFLICT (user_id, post_id) DO NOTHING
          `;
        }

        return json({ success: true, message: "Save updated successfully" });
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
                playback_policy: ["public"],
              },
            }),
          }
        );

        const muxData = await muxResponse.json();

        if (!muxResponse.ok || !muxData.data?.url) {
          return json({
            success: false,
            error:
              muxData.error?.messages?.[0] ||
              muxData.error?.message ||
              JSON.stringify(muxData),
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

    // MUX PROXY UPLOAD ROUTE
    if (
      ["/mux/proxy-upload", "/api/mux/proxy-upload"].includes(url.pathname) &&
      ["GET", "POST", "PUT", "PATCH", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      try {
        const targetUrl = url.searchParams.get("target");
        if (!targetUrl) {
          return json({ success: false, error: "Missing target URL" }, 400);
        }

        const forwardHeaders = {
          "Content-Type": request.headers.get("Content-Type") || "application/offset+octet-stream",
        };

        const optionalHeaderKeys = [
          "upload-length",
          "upload-offset",
          "tus-resumable",
          "upload-metadata",
          "upload-concat",
          "x-http-method-override",
        ];

        for (const key of optionalHeaderKeys) {
          const val = request.headers.get(key);
          if (val) {
            forwardHeaders[key] = val;
          }
        }

        const proxyRes = await fetch(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        });

        const responseHeaders = new Headers(corsHeaders());
        proxyRes.headers.forEach((val, key) => responseHeaders.set(key, val));

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers: responseHeaders,
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }
// MUX PROXY UPLOAD ROUTE
    if (
      ["/mux/proxy-upload", "/api/mux/proxy-upload"].includes(url.pathname) &&
      ["GET", "POST", "PUT", "PATCH", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      try {
        const targetUrl = url.searchParams.get("target");
        if (!targetUrl) {
          return json({ success: false, error: "Missing target URL" }, 400);
        }

        const forwardHeaders = {
          "Content-Type": request.headers.get("Content-Type") || "application/offset+octet-stream",
        };

        const optionalHeaderKeys = [
          "upload-length",
          "upload-offset",
          "tus-resumable",
          "upload-metadata",
          "upload-concat",
          "x-http-method-override",
        ];

        for (const key of optionalHeaderKeys) {
          const val = request.headers.get(key);
          if (val) {
            forwardHeaders[key] = val;
          }
        }

        const proxyRes = await fetch(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        });

        const responseHeaders = new Headers(corsHeaders());
        proxyRes.headers.forEach((val, key) => responseHeaders.set(key, val));

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers: responseHeaders,
        });
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
            ? `https://stream.mux.com/${playbackId}/high.mp4`
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

    // DELETE POST / REEL ROUTE
    const deleteMatch = url.pathname.match(/^\/posts\/([^/]+)\/delete$/);
    if (deleteMatch && request.method === "POST") {
      try {
        const rawId = decodeURIComponent(deleteMatch[1]);
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        if (!isNaN(rawId)) {
          await sql`DELETE FROM posts WHERE id = ${parseInt(rawId, 10)}`;
        } else {
          await sql`DELETE FROM posts WHERE id::text = ${rawId}`;
        }

        return json({
          success: true,
          message: "Post deleted successfully",
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }
// GET USER FOLLOWING LIST
    const userFollowingMatch = url.pathname.match(/^\/users\/([^/]+)\/following$/);
    if (userFollowingMatch && request.method === "GET") {
      try {
        const uid = decodeURIComponent(userFollowingMatch[1]);
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        await sql`
          CREATE TABLE IF NOT EXISTS follows (
            follower_id TEXT NOT NULL,
            following_id TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (follower_id, following_id)
          )
        `;

        const follows = await sql`
          SELECT following_id FROM follows WHERE follower_id = ${uid}
        `;

        const followingMap = {};
        follows.forEach((row) => {
          followingMap[row.following_id] = true;
        });

        return json({ success: true, followingIds: followingMap });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // INCREMENT POST VIEW COUNT
    const postViewMatch = url.pathname.match(/^\/posts\/([^/]+)\/view$/);
    if (postViewMatch && request.method === "POST") {
      try {
        const rawId = decodeURIComponent(postViewMatch[1]);
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(env.DATABASE_URL);

        await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0`;
        await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS views INT DEFAULT 0`;

        if (!isNaN(rawId)) {
          await sql`
            UPDATE posts 
            SET views_count = COALESCE(views_count, 0) + 1,
                views = COALESCE(views, 0) + 1
            WHERE id = ${parseInt(rawId, 10)}
          `;
        } else {
          await sql`
            UPDATE posts 
            SET views_count = COALESCE(views_count, 0) + 1,
                views = COALESCE(views, 0) + 1
            WHERE id::text = ${rawId}
          `;
        }

        return json({ success: true, message: "View recorded successfully" });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
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
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Upload-Length, Upload-Metadata, Tus-Resumable, Upload-Offset, Upload-Concat, X-HTTP-Method-Override",
    "Access-Control-Expose-Headers":
      "Location, Upload-Offset, Upload-Length, Tus-Resumable, Upload-Metadata, Upload-Concat",
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