$port = 8080
$root = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "dist"

if (-not (Test-Path (Join-Path $root "index.html"))) {
    Write-Host "================================================" -ForegroundColor Red
    Write-Host " エラー: ビルド済みのアプリ (dist) が見つかりません。"
    Write-Host " start.bat から起動してください。"
    Write-Host "================================================" -ForegroundColor Red
    exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "============================================"
Write-Host " 地図アプリを起動しました。"
Write-Host " ブラウザで http://localhost:$port/ を開いています..."
Write-Host " 終了するときは、このウィンドウを閉じてください。"
Write-Host "============================================"
Start-Process "http://localhost:$port/"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") { $localPath = "/index.html" }
        $filePath = Join-Path $root $localPath.TrimStart("/")

        if (-not (Test-Path $filePath -PathType Leaf)) {
            $filePath = Join-Path $root "index.html"
        }

        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentType = $contentType
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.OutputStream.Close()
    } catch {
        Write-Host "エラー: $_"
    }
}