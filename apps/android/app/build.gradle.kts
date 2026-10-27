plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Deployment configuration (overridable: -PcadsIssuer=... -PcadsApiBase=... -PcadsClientId=...).
val cadsApiBase = (project.findProperty("cadsApiBase") as String?) ?: "https://bunsenbrenner.org"
val cadsIssuer = (project.findProperty("cadsIssuer") as String?) ?: "https://auth.bunsenbrenner.org/realms/ct-demo"
val cadsClientId = (project.findProperty("cadsClientId") as String?) ?: "cads-mobile"
val redirectScheme = "org.bunsenbrenner.cads"

android {
    namespace = "org.bunsenbrenner.cads"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.bunsenbrenner.cads"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["appAuthRedirectScheme"] = redirectScheme
        buildConfigField("String", "API_BASE", "\"$cadsApiBase\"")
        buildConfigField("String", "OIDC_ISSUER", "\"$cadsIssuer\"")
        buildConfigField("String", "OIDC_CLIENT_ID", "\"$cadsClientId\"")
        buildConfigField("String", "REDIRECT_URI", "\"$redirectScheme:/oauth2redirect\"")
        // Rust core is built for these ABIs by build-rust.sh (cargo-ndk).
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // The signed sample templates are shared with the web builder; no copy is checked in.
    sourceSets["main"].assets.srcDir("../../../manifests/prompt-templates")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // OIDC Authorization Code + PKCE through Custom Tabs.
    implementation("net.openid:appauth:0.11.1")
    // Keystore-backed encrypted token storage.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // UniFFI-generated Kotlin bindings load the Rust library through JNA.
    implementation("net.java.dev.jna:jna:5.15.0@aar")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
