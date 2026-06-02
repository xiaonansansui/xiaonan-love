package com.xiaonan.lovepage

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.view.WindowManager
import android.graphics.Color
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private val PAGE_URL = "https://xiaonansansui.github.io/xiaonan-love/"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 沉浸式状态栏
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = Color.parseColor("#0a0015")
        window.navigationBarColor = Color.parseColor("#0a0015")

        val webView = WebView(this)
        setContentView(webView)

        webView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowContentAccess = true
                allowFileAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                    url?.let {
                        if (it.startsWith("https://") || it.startsWith("http://")) {
                            view?.loadUrl(it)
                        }
                    }
                    return true
                }
            }
            webChromeClient = WebChromeClient()
            setOnLongClickListener { true }
            loadUrl(PAGE_URL)
        }
    }

    override fun onBackPressed() {
        val webView = findViewById<WebView>(android.R.id.content)
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
