# Redimensiona el logotipo oficial y hace transparente el fondo blanco.
#
# Por que no se hace "a ojo" con un filtro de blanco global: el logo tiene
# zonas blancas INTERIORES (la pantalla del telefono) que deben conservarse.
# Por eso el relleno es por inundacion desde los bordes: solo alcanza el
# blanco exterior y las nullptr antialias que lo rodean, y se detiene al
# encontrar el azul del marco.
#
# El original NO se modifica. Este script escribe un derivado en assets/images/.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$src = Join-Path $root 'assets\parkeasy-logo.png'
$outDir = Join-Path $root 'assets\images'
$out = Join-Path $outDir 'parkeasy-logo.png'

if (-not (Test-Path $src)) { throw "No existe el origen: $src" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$target = 512
$whiteThreshold = 245   # >= en los 3 canales => se considera fondo

$image = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($target, $target, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($image, 0, 0, $target, $target)
$g.Dispose()
$image.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $target, $target)
$locked = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($locked.Stride * $target)
[System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $bytes, 0, $bytes.Length)

# BFS por inundacion desde los bordes.
$visited = New-Object 'System.Boolean[]' ($target * $target)
$queue = New-Object 'System.Collections.Generic.Queue[int]'

$stride = $locked.Stride
function Is-Background([int]$idx) {
  $o = $idx * 4
  if ($bytes[$o + 3] -eq 0) { return $true }
  return ($bytes[$o] -ge $whiteThreshold -and $bytes[$o + 1] -ge $whiteThreshold -and $bytes[$o + 2] -ge $whiteThreshold)
}
function Mark-Transparent([int]$idx) {
  $o = $idx * 4
  $bytes[$o + 3] = 0
  $bytes[$o] = 0
  $bytes[$o + 1] = 0
  $bytes[$o + 2] = 0
}

# Semilla: todo el perimetro.
$last = $target - 1
for ($x = 0; $x -lt $target; $x++) {
  foreach ($y in @(0, $last)) {
    $i = $y * $target + $x
    if (-not $visited[$i] -and (Is-Background $i)) { $visited[$i] = $true; $queue.Enqueue($i) }
  }
}
for ($y = 0; $y -lt $target; $y++) {
  foreach ($x in @(0, $last)) {
    $i = $y * $target + $x
    if (-not $visited[$i] -and (Is-Background $i)) { $visited[$i] = $true; $queue.Enqueue($i) }
  }
}

$cleared = 0
while ($queue.Count -gt 0) {
  $i = $queue.Dequeue()
  Mark-Transparent $i
  $cleared++

  $x = $i % $target
  $y = [math]::Floor($i / $target)

  foreach ($n in @(@(($x - 1), $y), @(($x + 1), $y), @($x, ($y - 1)), @($x, ($y + 1)))) {
    $nx = $n[0]; $ny = $n[1]
    if ($nx -lt 0 -or $nx -ge $target -or $ny -lt 0 -or $ny -ge $target) { continue }
    $ni = $ny * $target + $nx
    if ($visited[$ni]) { continue }
    if (-not (Is-Background $ni)) { continue }
    $visited[$ni] = $true
    $queue.Enqueue($ni)
  }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $locked.Scan0, $bytes.Length)
$bmp.UnlockBits($locked)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$final = Get-Item $out
[PSCustomObject]@{
  Origen        = Split-Path -Leaf $src
  Salida        = "assets/images/$($final.Name)"
  Dimensiones   = "${target}x${target}"
  PixelsVacios  = $cleared
  PesoKB        = [math]::Round($final.Length / 1KB, 1)
  PesoAntesKB   = [math]::Round((Get-Item $src).Length / 1KB, 1)
}