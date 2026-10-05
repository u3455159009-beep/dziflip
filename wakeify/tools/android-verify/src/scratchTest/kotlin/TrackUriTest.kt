package app.wakeify.alarm

import android.net.Uri
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * The ring service turns the track's file:// URI into a filesystem path with
 * Uri.parse(uri).path. This checks (against the real android.net.Uri from
 * android-all) that percent-encoded spaces / diacritics are decoded.
 */
class TrackUriTest {
  @Test
  fun percentEncodedFileUriDecodesToPath() {
    val uri = "file:///data/user/0/app.wakeify/files/music/M%C5%AFj%20bud%C3%ADk%20(1).mp3"
    assertEquals("file", Uri.parse(uri).scheme)
    assertEquals("/data/user/0/app.wakeify/files/music/Můj budík (1).mp3", Uri.parse(uri).path)
  }

  @Test
  fun unencodedFileUriAndBarePath() {
    assertEquals("/data/x/files/a b.mp3", Uri.parse("file:///data/x/files/a b.mp3").path)
    assertEquals(null, Uri.parse("/data/x/files/a.mp3").scheme)
    assertEquals("/data/x/files/a.mp3", Uri.parse("/data/x/files/a.mp3").path)
  }
}
