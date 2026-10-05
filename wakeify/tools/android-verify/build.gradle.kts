// JVM-only verification of the Android engine: compiles the framework-only
// Kotlin core against a full Android 15 framework jar (Robolectric android-all)
// and runs the JUnit tests. NOT an Android/AGP build. Run: gradle clean test
plugins { kotlin("jvm") version "2.1.21" }
repositories { mavenCentral() }
val moduleAndroid = file("../../modules/wakeify-alarm/android/src")
// Framework-only core classes (no androidx / expo imports).
val coreFiles = listOf(
  "AlarmSpec.kt", "AlarmTimeCalculator.kt", "AlarmStore.kt", "AlarmScheduler.kt",
  "AlarmReceiver.kt", "AlarmRingService.kt", "RingEvents.kt", "AlarmIntents.kt", "LockScreenHelper.kt"
)
sourceSets {
  main { kotlin { setSrcDirs(emptyList<String>()); srcDir(moduleAndroid.resolve("main/java")); include(coreFiles.map { "**/$it" }) } }
  test { kotlin { setSrcDirs(listOf(moduleAndroid.resolve("test/java"), file("src/scratchTest/kotlin"))) } }
}
kotlin { jvmToolchain(21) }
dependencies {
  compileOnly("org.robolectric:android-all:15-robolectric-13954326")
  testImplementation("org.robolectric:android-all:15-robolectric-13954326")
  testImplementation(platform("org.junit:junit-bom:5.11.4"))
  testImplementation("org.junit.jupiter:junit-jupiter")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
tasks.test { useJUnitPlatform(); testLogging { events("passed", "failed", "skipped"); showStandardStreams = false; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL } }
