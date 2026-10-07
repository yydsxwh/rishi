plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.yydsxwh.kemiao.days"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.yydsxwh.kemiao.days"
        minSdk = 26
        targetSdk = 35
        versionCode = 18
        versionName = "2.4.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        // 临时应急默认走香港 xiaowenhua.net。恢复吉隆坡后只改 RISHI_API_BASE_URL / RISHI_LOGIN_URL。
        // 登录回调如果必须用账号中心已登记的地址，单独设置 RISHI_LOGIN_URL，不要改业务代码。
        val rishiApiBase = (System.getenv("RISHI_API_BASE_URL") ?: "https://xiaowenhua.net/kemiao-days-api").trim().trimEnd('/')
        val rishiLoginUrl = System.getenv("RISHI_LOGIN_URL") ?: "$rishiApiBase/api/days/auth/login?native=1"
        buildConfigField("String", "DAYS_API_ORIGIN", "\"$rishiApiBase\"")
        buildConfigField("String", "LOGIN_URL", "\"$rishiLoginUrl\"")
        buildConfigField("String", "HANDOFF_SCHEME", "\"kemiao-days\"")
    }

    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }
    val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() }
    val keyAlias = System.getenv("ANDROID_KEY_ALIAS")?.takeIf { it.isNotBlank() }
    val keyPassword = System.getenv("ANDROID_KEY_PASSWORD")?.takeIf { it.isNotBlank() }
    val missingReleaseSecrets = listOf(
        "ANDROID_KEYSTORE_PATH" to keystorePath,
        "ANDROID_KEYSTORE_PASSWORD" to keystorePassword,
        "ANDROID_KEY_ALIAS" to keyAlias,
        "ANDROID_KEY_PASSWORD" to keyPassword,
    ).filter { it.second == null }.map { it.first }

    signingConfigs {
        if (missingReleaseSecrets.isEmpty()) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword!!
                this.keyAlias = keyAlias!!
                this.keyPassword = keyPassword!!
            }
        }
    }

    buildTypes {
        release {
            // 没有正式签名就不要产出可安装的 Release。禁止退回 debug.keystore。
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.maxHeapSize = "2048m"
            it.maxParallelForks = 1
        }
    }
    lint {
        abortOnError = true
        warningsAsErrors = false
        disable += setOf("GradleDependency", "OldTargetApi")
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("org.robolectric:robolectric:4.14.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

val releaseTasks = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
if (releaseTasks) {
    val missing = listOf(
        "ANDROID_KEYSTORE_PATH",
        "ANDROID_KEYSTORE_PASSWORD",
        "ANDROID_KEY_ALIAS",
        "ANDROID_KEY_PASSWORD",
    ).filter { System.getenv(it).isNullOrBlank() }
    if (missing.isNotEmpty()) {
        throw GradleException("正式 Release 缺少签名配置：${missing.joinToString(", ")}。拒绝使用 debug 签名或临时证书。")
    }
}
