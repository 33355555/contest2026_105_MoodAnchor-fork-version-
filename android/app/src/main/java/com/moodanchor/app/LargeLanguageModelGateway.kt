package com.moodanchor.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ChatReply(
    val text: String,
    val conversationId: String? = null,
    val botId: String? = null,
)

/**
 * Coze 后端。模型密钥仅保存在服务端；评审访问码可由用户在设置中临时输入。
 */
class CozeGateway(
    private val clientId: String,
    private val baseUrl: String,
    private val accessToken: String,
    private var conversationId: String? = null,
    private var startNewConversation: Boolean = false,
    private val onConversationId: (String) -> Unit = {},
) {
    fun reply(event: MoodEvent?, userMessage: String): ChatReply {
        val body = JSONObject()
            .put("message", userMessage)
            .put("provider", "coze")
            .put("client_id", clientId)
        if (!conversationId.isNullOrBlank()) body.put("conversation_id", conversationId)
        if (startNewConversation) body.put("new_conversation", true)
        val connection = (URL("${baseUrl.trimEnd('/')}/chat").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 90_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (accessToken.isNotBlank()) setRequestProperty("Authorization", "Bearer $accessToken")
        }
        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val response = (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream)
            ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (connection.responseCode !in 200..299) {
            val error = runCatching { JSONObject(response).optString("detail") }.getOrDefault("")
            throw IllegalStateException(error.ifBlank { "后端请求失败（${connection.responseCode}）" })
        }
        val data = JSONObject(response)
        data.optString("conversation_id").takeIf { it.isNotBlank() }?.let {
            conversationId = it
            startNewConversation = false
            onConversationId(it)
        }
        return ChatReply(
            text = data.getString("reply").trim(),
            conversationId = data.optString("conversation_id").takeIf { it.isNotBlank() },
            botId = data.optString("bot_id").takeIf { it.isNotBlank() },
        )
    }
}
