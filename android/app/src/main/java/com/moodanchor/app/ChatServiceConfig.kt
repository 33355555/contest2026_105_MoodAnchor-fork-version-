package com.moodanchor.app

import android.content.Context

/** User-entered endpoint and short-lived review access code; neither is a model key. */
object ChatServiceConfig {
    private const val PREFERENCES = "chat_service_config"
    private const val ENDPOINT = "endpoint"
    private const val ACCESS_TOKEN = "access_token"
    // Contest-review defaults. These are only a gateway URL and a limited review
    // access code, never a Coze or SiliconFlow provider key.
    private const val DEFAULT_REVIEW_ENDPOINT =
        "https://1490328656-fj1mh44onq.ap-beijing.tencentscf.com"
    private const val DEFAULT_REVIEW_ACCESS_TOKEN = "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW"
    private const val LEGACY_LAN_ENDPOINT = "http://192.168.87.164:6006"

    data class Value(val endpoint: String, val accessToken: String)

    fun read(context: Context): Value {
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val storedEndpoint = preferences.getString(ENDPOINT, "").orEmpty()
        val storedToken = preferences.getString(ACCESS_TOKEN, "").orEmpty()
        return Value(
            endpoint = when {
                storedEndpoint.isBlank() || storedEndpoint == LEGACY_LAN_ENDPOINT -> DEFAULT_REVIEW_ENDPOINT
                else -> storedEndpoint
            },
            accessToken = storedToken.ifBlank { DEFAULT_REVIEW_ACCESS_TOKEN },
        )
    }

    fun save(context: Context, endpoint: String, accessToken: String) {
        val normalized = endpoint.trim().trimEnd('/')
        require(normalized.startsWith("https://") || normalized.startsWith("http://")) {
            "服务地址需以 http:// 或 https:// 开头。"
        }
        require(!normalized.endsWith("/chat")) {
            "请输入服务根地址，不要附加 /chat。"
        }
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
            .putString(ENDPOINT, normalized)
            .putString(ACCESS_TOKEN, accessToken.trim())
            .apply()
    }
}
