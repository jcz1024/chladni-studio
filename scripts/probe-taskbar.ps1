param([Parameter(Mandatory=$true)][string]$WindowHandle)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ChladniFullscreenProbe {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string name, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
}
'@
[void][ChladniFullscreenProbe]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$appHandle=[IntPtr]::new([long]::Parse($WindowHandle))
$taskbarHandle=[ChladniFullscreenProbe]::FindWindow('Shell_TrayWnd',$null)
if ($taskbarHandle -eq [IntPtr]::Zero) { throw 'Windows primary taskbar was not found' }
$appRect=[ChladniFullscreenProbe+Rect]::new()
$barRect=[ChladniFullscreenProbe+Rect]::new()
if (-not [ChladniFullscreenProbe]::GetWindowRect($appHandle,[ref]$appRect)) { throw 'Cannot read application window bounds' }
if (-not [ChladniFullscreenProbe]::GetWindowRect($taskbarHandle,[ref]$barRect)) { throw 'Cannot read taskbar bounds' }
$point=[ChladniFullscreenProbe+Point]::new()
$point.X=[Math]::Max($appRect.Left+1,[Math]::Min([int](($barRect.Left+$barRect.Right)/2),$appRect.Right-2))
$point.Y=[Math]::Max($appRect.Top+1,[Math]::Min([int](($barRect.Top+$barRect.Bottom)/2),$appRect.Bottom-2))
$topWindow=[ChladniFullscreenProbe]::GetAncestor([ChladniFullscreenProbe]::WindowFromPoint($point),2)
[pscustomobject]@{AppHandle=$appHandle.ToInt64().ToString();TopWindow=$topWindow.ToInt64().ToString();Point=@{X=$point.X;Y=$point.Y};AppRect=$appRect;TaskbarRect=$barRect;AppCoversTaskbar=($topWindow -eq $appHandle)} | ConvertTo-Json -Depth 4 -Compress
