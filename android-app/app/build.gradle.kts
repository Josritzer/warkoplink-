plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun propertyOrEnv(propertyName: String, envName: String): String =
    providers.gradleProperty(propertyName).orElse(providers.environmentVariable(envName)).orElse("").get()
fun quoted(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.warkoplink.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.warkoplink.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
        buildConfigField("String", "FIREBASE_API_KEY", quoted(propertyOrEnv("firebaseApiKey", "WARKOP_FIREBASE_API_KEY")))
        buildConfigField("String", "FIREBASE_APP_ID", quoted(propertyOrEnv("firebaseAppId", "WARKOP_FIREBASE_APP_ID")))
        buildConfigField("String", "FIREBASE_PROJECT_ID", quoted(propertyOrEnv("firebaseProjectId", "WARKOP_FIREBASE_PROJECT_ID")))
        buildConfigField("String", "FIREBASE_SENDER_ID", quoted(propertyOrEnv("firebaseSenderId", "WARKOP_FIREBASE_SENDER_ID")))
    }

    buildTypes {
        release { isMinifyEnabled = false }
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
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.02.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation(platform("com.google.firebase:firebase-bom:33.15.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
