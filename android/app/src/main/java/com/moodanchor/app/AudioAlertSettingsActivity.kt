package com.moodanchor.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.moodanchor.app.MoodUi.dp

class AudioAlertSettingsActivity : AppCompatActivity() {
    private var pickedUri: Uri? = null
    private lateinit var fileDescription: android.widget.TextView
    private lateinit var enableSwitch: Switch

    private val chooseAudio = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@registerForActivityResult
        try {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) { }
        pickedUri = uri
        updateFileDescription()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor(MoodUi.BACKGROUND)
        window.navigationBarColor = Color.parseColor(MoodUi.BACKGROUND)
        pickedUri = BluetoothAudioAlert.selectedUri(this)

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(36), dp(24), dp(36))
        }
        content.addView(MoodUi.button(this, "‹ 返回", false).apply {
            setOnClickListener { finish() }
        })
        content.addView(MoodUi.space(this, 20))
        content.addView(MoodUi.title(this, "钟声设置", 29f))
        content.addView(MoodUi.body(this, "在需要时，为自己留出一小段暂停。你可以主动选择一段熟悉的声音、白噪音或音乐，作为是非钟的提醒音频。", 15f).apply {
            setPadding(0, dp(8), 0, dp(22))
        })

        val settingCard = MoodUi.card(this)
        enableSwitch = Switch(this).apply {
            text = "启用事件音频提醒"
            textSize = 17f
            isChecked = BluetoothAudioAlert.enabled(this@AudioAlertSettingsActivity)
        }
        settingCard.addView(enableSwitch)
        settingCard.addView(MoodUi.space(this, 12))
        fileDescription = MoodUi.body(this, "", 14f)
        settingCard.addView(fileDescription)
        settingCard.addView(MoodUi.body(this, "触发方式：主动启用并选择音频后，手表确认事件可请求播放。请求前检查蓝牙耳机连接状态，未检测到耳机则跳过，不主动改用扬声器。播放后的输出由系统路由决定，请留意耳机断连或输出切换。", 12f).apply {
            setPadding(0, dp(12), 0, 0)
        })
        settingCard.addView(MoodUi.space(this, 14))
        settingCard.addView(MoodUi.button(this, "选择语音或音乐文件", false).apply {
            setOnClickListener { chooseAudio.launch(arrayOf("audio/*")) }
        })
        settingCard.addView(MoodUi.space(this, 10))
        settingCard.addView(MoodUi.button(this, "保存设置").apply {
            setOnClickListener {
                if (enableSwitch.isChecked && pickedUri == null) {
                    Toast.makeText(this@AudioAlertSettingsActivity, "请先选择一段音频", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                BluetoothAudioAlert.save(this@AudioAlertSettingsActivity, enableSwitch.isChecked, pickedUri)
                Toast.makeText(this@AudioAlertSettingsActivity, "钟声设置已保存", Toast.LENGTH_SHORT).show()
            }
        })
        settingCard.addView(MoodUi.space(this, 10))
        settingCard.addView(MoodUi.button(this, "开始测试耳机播放", false).apply {
            setOnClickListener {
                val played = BluetoothAudioAlert.preview(this@AudioAlertSettingsActivity, pickedUri)
                Toast.makeText(
                    this@AudioAlertSettingsActivity,
                    if (played) "已开始钟声测试；可在系统媒体控制区或下方结束" else "钟声未播放：请确认已选择音频并连接蓝牙耳机",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
        settingCard.addView(MoodUi.space(this, 10))
        settingCard.addView(MoodUi.button(this, "结束当前钟声", false).apply {
            setOnClickListener {
                BluetoothAudioAlert.stop(this@AudioAlertSettingsActivity)
                Toast.makeText(this@AudioAlertSettingsActivity, "已结束钟声播放", Toast.LENGTH_SHORT).show()
            }
        })
        content.addView(settingCard)
        content.addView(MoodUi.space(this, 16))
        content.addView(MoodUi.body(this, "当前蓝牙耳机：${if (BluetoothAudioAlert.hasBluetoothHeadset(this)) "已连接" else "未连接"}", 13f).apply {
            setPadding(dp(4), 0, 0, 0)
        })
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.parseColor(MoodUi.BACKGROUND)); isFillViewport = true; addView(content)
        })
        updateFileDescription()
    }

    private fun updateFileDescription() {
        val uri = pickedUri
        if (uri == null) {
            fileDescription.text = "尚未选择音频。"
            return
        }
        val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        } ?: "已选择本地音频"
        fileDescription.text = "已选择：$name"
    }
}
