"""Native messaging host for 1-Click Video Downloader.

Actions (one message per connection):
  {"action": "info", "url": ...}                      -> quality list
  {"action": "download", "url", "height", "audio", "folder", "ask"} -> progress stream
  {"action": "pick", "folder"}                        -> folder chooser
"""
import json
import os
import re
import shutil
import struct
import subprocess
import sys

DEFAULT_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "Videos")
NO_WINDOW = 0x08000000 if os.name == "nt" else 0


# ---------- native messaging ----------
def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    n = struct.unpack("<I", raw)[0]
    return json.loads(sys.stdin.buffer.read(n).decode("utf-8"))


def send(obj):
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


# ---------- helpers ----------
def find_tool(name):
    extra = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links"),
        os.path.expanduser(r"~\scoop\shims"),
        r"C:\ffmpeg\bin",
        os.path.expandvars(r"%ProgramFiles%\nodejs"),
        os.path.expanduser(r"~\.deno\bin"),
    ]
    found = shutil.which(name) or shutil.which(name, path=os.pathsep.join(extra))
    if not found and name == "ffmpeg":
        # winget er package folder e khuji
        pkgs = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
        if os.path.isdir(pkgs):
            for root, _dirs, files in os.walk(pkgs):
                if "ffmpeg.exe" in files:
                    return os.path.join(root, "ffmpeg.exe")
    return found


FFMPEG = find_tool("ffmpeg")


def base_cmd(url):
    cmd = [sys.executable, "-m", "yt_dlp", url, "--no-playlist", "--no-colors"]
    if not find_tool("deno"):
        node = find_tool("node")
        if node:
            cmd += ["--js-runtimes", "node:" + node]
    if FFMPEG:
        cmd += ["--ffmpeg-location", os.path.dirname(FFMPEG)]
    return cmd


def last_error(text):
    lines = [l for l in text.splitlines() if l.strip()]
    for l in reversed(lines):
        if "ERROR" in l or "No module named" in l:
            return l.strip()
    return lines[-1].strip() if lines else "Unknown error"


def pick_folder(initial):
    initial = initial if initial and os.path.isdir(initial) else DEFAULT_DIR
    os.makedirs(initial, exist_ok=True)
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        root.update()
        path = filedialog.askdirectory(parent=root, initialdir=initial,
                                       title="Video kothay save korben?", mustexist=True)
        root.destroy()
        return os.path.normpath(path) if path else None
    except Exception:
        ps = (
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$f=New-Object System.Windows.Forms.Form -Property @{TopMost=$true};"
            "$d=New-Object System.Windows.Forms.FolderBrowserDialog;"
            "$d.Description='Video kothay save korben?';$d.SelectedPath=$env:VDL_INIT;"
            "if($d.ShowDialog($f) -eq 'OK'){[Console]::Out.Write($d.SelectedPath)}"
        )
        r = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps],
                           capture_output=True, text=True, encoding="utf-8",
                           env={**os.environ, "VDL_INIT": initial})
        return r.stdout.strip() or None


# ---------- actions ----------
def do_info(url):
    r = subprocess.run(base_cmd(url) + ["-J", "--no-warnings"], capture_output=True,
                       stdin=subprocess.DEVNULL, creationflags=NO_WINDOW,
                       text=True, encoding="utf-8", errors="replace", timeout=120)
    if r.returncode != 0:
        send({"type": "error", "message": last_error(r.stderr)})
        return
    d = json.loads(r.stdout)
    if d.get("_type") == "playlist" and d.get("entries"):
        d = d["entries"][0]
    formats = d.get("formats") or [d]

    audio_size = 0
    has_audio_only = False
    for f in formats:
        if f.get("vcodec") == "none" and f.get("acodec") not in (None, "none"):
            has_audio_only = True
            audio_size = max(audio_size, f.get("filesize") or f.get("filesize_approx") or 0)

    by_height = {}
    for f in formats:
        h, w = f.get("height"), f.get("width")
        if not h or f.get("vcodec") == "none":
            continue
        muxed = f.get("acodec") not in (None, "none")
        if not FFMPEG and not muxed:
            continue  # ffmpeg chara alada video+audio jora jay na
        size = f.get("filesize") or f.get("filesize_approx") or 0
        if size and not muxed:
            size += audio_size
        label = min(h, w) if w else h  # vertical video (Shorts/Reels) er jonno
        cur = by_height.get(h)
        if not cur or size > cur["size"]:
            by_height[h] = {"height": h, "label": f"{label}p", "size": size}

    qualities = sorted(by_height.values(), key=lambda q: q["height"], reverse=True)
    send({
        "type": "info",
        "title": d.get("title") or "Video",
        "duration": d.get("duration"),
        "qualities": qualities,
        "audio": has_audio_only or bool(qualities),
        "mp3": bool(FFMPEG),
        "ffmpeg": bool(FFMPEG),
        "default_dir": DEFAULT_DIR,
    })


def do_download(msg):
    url = msg["url"]
    folder = msg.get("folder") or DEFAULT_DIR
    if msg.get("ask"):
        chosen = pick_folder(folder)
        if not chosen:
            send({"type": "cancelled"})
            return
        folder = chosen
        send({"type": "folder", "path": folder})
    os.makedirs(folder, exist_ok=True)

    cmd = base_cmd(url) + [
        "--newline", "--progress", "--windows-filenames",
        "-P", folder, "-o", "%(title).150B [%(id)s].%(ext)s",
        "--progress-template", "download:PROG %(progress._percent_str)s",
        "--print", "before_dl:TITLE %(title)s",
        "--print", "after_move:FILE %(filepath)s",
    ]
    h = msg.get("height")
    if msg.get("audio"):
        if FFMPEG:
            cmd += ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
        else:
            cmd += ["-f", "ba[ext=m4a]/ba/b"]
    elif FFMPEG:
        hf = f"[height<={h}]" if h else ""
        cmd += ["-f", f"bv*{hf}+ba/b{hf}/b", "-S", "res,vcodec:h264,acodec:m4a",
                "--merge-output-format", "mp4"]
    else:
        hf = f"[height<={h}]" if h else ""
        cmd += ["-f", f"b{hf}[ext=mp4]/b{hf}/b"]

    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, creationflags=NO_WINDOW,
                         text=True, encoding="utf-8", errors="replace")
    out, final_file, last_pct = [], None, -1
    for line in p.stdout:
        line = line.strip()
        if line.startswith("TITLE "):
            send({"type": "start", "title": line[6:]})
        elif line.startswith("PROG "):
            m = re.search(r"([\d.]+)%", line)
            if m:
                pct = int(float(m.group(1)))
                if pct != last_pct:
                    last_pct = pct
                    send({"type": "progress", "percent": pct})
        elif line.startswith("FILE "):
            final_file = line[5:]
        else:
            out.append(line)
    if p.wait() == 0:
        send({"type": "done", "file": final_file or folder})
    else:
        send({"type": "error", "message": last_error("\n".join(out))})


def main():
    msg = read_msg() or {}
    action = msg.get("action", "download")
    if action == "info":
        do_info(msg["url"])
    elif action == "pick":
        path = pick_folder(msg.get("folder"))
        send({"type": "folder", "path": path} if path else {"type": "cancelled"})
    elif msg.get("url"):
        do_download(msg)
    else:
        send({"type": "error", "message": "URL pawa jayni"})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send({"type": "error", "message": str(e)})
