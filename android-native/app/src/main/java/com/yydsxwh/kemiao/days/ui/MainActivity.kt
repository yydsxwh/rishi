package com.yydsxwh.kemiao.days.ui

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.core.app.ActivityCompat
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.local.AppearanceStore
import com.yydsxwh.kemiao.days.ui.theme.DaysTheme

class MainActivity : ComponentActivity() {
    private val viewModel: DaysViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11)
        }
        viewModel.consumeHandoff(intent?.data)
        setContent {
            val appearance = AppearanceStore(this)
            val dark = when (appearance.theme()) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            val current = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(current.density, current.fontScale * appearance.fontScale())) {
                DaysTheme(dark = dark) {
                    LaunchedEffect(intent?.data) { viewModel.consumeHandoff(intent?.data) }
                    DaysApp(viewModel = viewModel, activity = this)
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.consumeHandoff(intent.data)
    }

    override fun onResume() {
        super.onResume()
        viewModel.syncNow()
    }
}
