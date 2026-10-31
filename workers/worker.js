export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/") {
      return json({
        ok: true,
        service: "Vezlivo API",
      });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "Vezlivo API",
        status: "healthy",
      });
    }

    // Handle Post Creation
    if (url.pathname === "/api/posts" && request.method === "POST") {
      try {
        const body = await request.json();
        const {
          id, uid, username, userEmail, userPhotoURL, mediaType,
          mediaURL, storagePath, caption, hashtags, mentions,
          taggedFriends, audience, commentsEnabled, originalAudio,
          selectedSound, musicName, musicURL, musicVolume, background,
          filter, speed, muted, overlayText, createdAt, location,
          allowSharing, allowDownloads, brandedContent, brandName,
          coverURL, coverStoragePath, coverSource, coverFrameTime,
          coverFit, coverPositionX, coverPositionY, coverZoom, postType
        } = body;

        if (!uid || !mediaURL) {
          return json({ ok: false, error: "Missing required fields (uid or mediaURL)" }, 400);
        }

        // Insert post into Neon PostgreSQL database
        await env.DATABASE.query(
          `INSERT INTO posts (
            id, uid, username, user_email, user_photo_url, media_type,
            media_url, storage_path, caption, hashtags, mentions,
            tagged_friends, audience, comments_enabled, original_audio,
            selected_sound, music_name, music_url, music_volume, background,
            filter_style, speed, muted, overlay_text, created_at, location,
            allow_sharing, allow_downloads, branded_content, brand_name,
            cover_url, cover_storage_path, cover_source, cover_frame_time,
            cover_fit, cover_position_x, cover_position_y, cover_zoom, post_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39)
          ON CONFLICT (id) DO NOTHING;`,
          [
            id, uid, username, userEmail, userPhotoURL, mediaType,
            mediaURL, storagePath, caption, JSON.stringify(hashtags || []), JSON.stringify(mentions || []),
            JSON.stringify(taggedFriends || []), audience, commentsEnabled, originalAudio,
            selectedSound, musicName, musicURL, musicVolume, background,
            filter, speed, muted, overlayText, createdAt, location,
            allowSharing, allowDownloads, brandedContent, brandName,
            coverURL, coverStoragePath, coverSource, coverFrameTime,
            coverFit, coverPositionX, coverPositionY, coverZoom, postType || 'post'
          ]
        );

        return json({ ok: true, postId: id });
      } catch (err) {
        console.error("Post creation error:", err);
        return json({ ok: false, error: err.message }, 500);
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