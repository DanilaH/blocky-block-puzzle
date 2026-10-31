package com.danilah.blocky.dev;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle state){registerPlugin(BlockyAdsPlugin.class);registerPlugin(BlockyAudioFocusPlugin.class);registerPlugin(BlockyHapticsPlugin.class);registerPlugin(BlockyDiagnosticsPlugin.class);super.onCreate(state);}
}
