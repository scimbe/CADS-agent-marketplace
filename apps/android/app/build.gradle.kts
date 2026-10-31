import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Deployment configuration (overridable: -PcadsIssuer=... -PcadsApiBase=... -PcadsClientId=...).
val cadsApiBase = (project.findProperty("cadsApiBase") as String?) ?: "https://bunsenbrenner.org"
val cadsIssuer = (project.findProperty("cadsIssuer") as String?) ?: "https://auth.bunsenbrenner.org/realms/ct-demo"
val cadsClientId = (project.findProperty("cadsClientId") as String?) ?: "cads-mobile"
// Android uses a verified App Link (https) as OAuth redirect, not a custom scheme another app could claim.
val cadsRedirectUri = (project.findProperty("cadsRedirectUri") as String?) ?: "https://bunsenbrenner.org/app/oauth2redirect"
val redirect = URI(cadsRedirectUri)
// The only host (besides the bundled assets) the Duell WebView may talk to: the Duell config API.
val duellApiBase = (project.findProperty("cadsDuellApiBase") as String?) ?: "https://demos-34a13a96.bunsenbrenner.org"

val duellAssets = layout.buildDirectory.dir("generated/duell-assets")
val syncDuellAsset = tasks.register("syncDuellAsset") {
    val real = rootProject.file("../duell-web/dist/index.html")
    val placeholder = file("src/placeholder/duell/index.html")
    val out = duellAssets.map { it.dir("duell") }
    val requireReal = (project.findProperty("duellRequireReal") as String?) == "true"
    inputs.files(real, placeholder).optional()
    outputs.dir(out)
    doLast {
        if (requireReal && !real.exists()) throw GradleException("apps/duell-web/dist/index.html missing (duellRequireReal=true)")
        val src = if (real.exists()) real else placeholder
        logger.lifecycle("Duell page: ${if (real.exists()) "real" else "PLACEHOLDER"} (${src})")
        val dir = out.get().asFile
        dir.mkdirs()
        src.copyTo(File(dir, "index.html"), overwrite = true)
    }
}
tasks.configureEach {
    if (name.startsWith("merge") && name.endsWith("Assets")) dependsOn(syncDuellAsset)
    if (name.startsWith("lintVital") || name.startsWith("lint")) dependsOn(syncDuellAsset)
}

android {
    namespace = "org.bunsenbrenner.cads"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.bunsenbrenner.cads"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["appAuthRedirectScheme"] = redirect.scheme // required by AppAuth's manifest
        manifestPlaceholders["redirectHost"] = redirect.host
        manifestPlaceholders["redirectPath"] = redirect.path
        buildConfigField("String", "API_BASE", "\"$cadsApiBase\"")
        buildConfigField("String", "OIDC_ISSUER", "\"$cadsIssuer\"")
        buildConfigField("String", "OIDC_CLIENT_ID", "\"$cadsClientId\"")
        buildConfigField("String", "DUELL_API_BASE", "\"$duellApiBase\"")
        buildConfigField("String", "REDIRECT_URI", "\"$cadsRedirectUri\"")
        // Rust core is built for these ABIs by build-rust.sh (cargo-ndk).
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Duell page: the real offline file of apps/duell-web is copied into the assets at build time;
    // without it a tiny test placeholder is used (never for a release: -PduellRequireReal=true).
    sourceSets["main"].assets.srcDir(duellAssets)

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
    // WebViewAssetLoader: serves the bundled Duell page from https://appassets.androidplatform.net.
    implementation("androidx.webkit:webkit:1.12.1")

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
