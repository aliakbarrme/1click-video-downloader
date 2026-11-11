# 1-Click Video Downloader (Chrome)

IDM-er moto: jekono video-r **upor dane "Download" button** ashe. Click korle quality list (1080p, 720p, MP3…) dekhay. Quality bachai korle folder jiggesh kore, tarpor download hoy.
YouTube, Facebook, Instagram, TikTok, X, Vimeo shoho 1000+ site support kore. Bhitore [yt-dlp](https://github.com/yt-dlp/yt-dlp) kaj kore.

## Setup (ekbar)
1. ZIP **Extract all** koro. Folder ta pore ar sorio na.
2. `host\install.bat` e double-click koro. Eta yt-dlp ar ffmpeg install kore, tarpor Chrome er sathe helper register kore.
3. Chrome e `chrome://extensions` → **Developer mode** on → **Load unpacked** → `extension` folder select koro.
4. Chrome purapuri bondho kore abar kholo.

## Babohar
- **Video-r upor button:** video-r top-right e **⬇ Download** → quality select → folder select → download. Button e % progress dekhabe.
- **Folder:** menu-r niche **Change** diye default folder thik koro. "Protibar folder jiggesh korbe" off korle shob shomoy oi folder e save hobe.
- **Toolbar icon:** 1 click e best quality, last folder e.
- **Right-click:** link, video ba page e right-click → "…video download korun".

## Update
Notun version namiye `extension` ar `host` folder replace koro, `install.bat` abar run koro, tarpor `chrome://extensions` e extension-er ↻ reload button chapo.

## Somossa hole
- "Helper connect hoyni": `install.bat` abar run koro, tarpor Chrome restart dao.
- 720p-er upore quality na dekhale ffmpeg install hoyni: `winget install Gyan.FFmpeg` diye install koro.
- YouTube kaj na korle yt-dlp update koro: `python -m pip install -U "yt-dlp[default]"`

> Shudhu nijer ba onumoti ache emon video download korbe. Kichu site er niyome download nished.
