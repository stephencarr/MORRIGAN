package org.morrigan.mobile;

import static org.junit.Assert.assertEquals;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public final class NativeGraphicsRuntimeTest {
    @Test public void nativeCanvasRasterizesPixels() {
        Bitmap bitmap = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888);
        new Canvas(bitmap).drawColor(Color.rgb(255, 176, 0));
        assertEquals(Color.rgb(255, 176, 0), bitmap.getPixel(4, 4));
        bitmap.recycle();
    }
}
