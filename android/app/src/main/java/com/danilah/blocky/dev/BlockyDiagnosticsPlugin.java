package com.danilah.blocky.dev;

import android.content.Intent;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BlockyDiagnostics")
public class BlockyDiagnosticsPlugin extends Plugin {
  @PluginMethod public void share(PluginCall call) {
    String json = call.getString("json", "");
    if (json.isEmpty() || json.length() > 1000000) { call.reject("Invalid diagnostics"); return; }
    try {
      File file = new File(getContext().getCacheDir(), "blocky-performance-0.26.json");
      try (FileOutputStream out = new FileOutputStream(file)) { out.write(json.getBytes(StandardCharsets.UTF_8)); }
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType("application/json");
      send.putExtra(Intent.EXTRA_STREAM, FileProvider.getUriForFile(getContext(), getContext().getPackageName()+".fileprovider", file));
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getActivity().runOnUiThread(() -> {
        try { getActivity().startActivity(Intent.createChooser(send, "Отправить диагностику")); call.resolve(); }
        catch (Exception error) { call.reject("Cannot share diagnostics", error); }
      });
    } catch (Exception error) { call.reject("Cannot export diagnostics", error); }
  }
}
