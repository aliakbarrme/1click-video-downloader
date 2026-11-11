"""Native messaging host: Chrome extension theke URL ney, yt-dlp diye download kore."""
import json
import os
import re
import shutil
import struct
import subprocess
import sys

DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "Videos")


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    n = struct.unpack("<I", raw)[0]
    return json.loads(sys.stdin.buffer.read(n).decode("utf-8"))


def send(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def find_tool(name):
    # winget/scoop install korle Chrome er PATH e na thakte pare
    extra = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links"),
        os.path.expanduser(r"~\scoop\shims"),
        r"C:\ffmpeg\bin",
        os.path.expandvars(r"%ProgramFiles%\nodejs"),
        os.path.expanduser(r"~\.deno\bin"),
    ]
    return shutil.which(name) or shutil.which(name, path=os.pathsep.join(extra))


def main():
    msg = read_msg()
    if not msg or not msg.get("url"):
        send({"type": "error", "message": "URL pawa jayni"})
        return
    url = msg["url"]
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    cmd = [sys.executable, "-m", "yt_dlp", url,
           "--no-playlist", "--newline", "--no-colors", "--restrict-filenames",
           "-P", DOWNLOAD_DIR, "-o", "%(title).150B [%(id)s].%(ext)s",
           "--progress-template", "download:PROG %(progress._percent_str)s",
           "--print", "before_dl:TITLE %(title)s",
           "--print", "after_move:FILE %(filepath)s"]

    ffmpeg = find_tool("ffmpeg")
    if ffmpeg:
        cmd += ["-f", "bv*+ba/b", "--merge-output-format", "mp4",
                "--ffmpeg-location", os.path.dirname(ffmpeg)]
    else:
        cmd += ["-f", "b[ext=mp4]/b"]  # ffmpeg chara: audio+video ek file e ache emon format

    # YouTube er jonno JS runtime (deno thakle yt-dlp nijei use kore)
    if not find_tool("deno"):
        node = find_tool("node")
        if node:
            cmd += ["--js-runtimes", "node:" + node]

    flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             stdin=subprocess.DEVNULL, creationflags=flags,
                             text=True, encoding="utf-8", errors="replace")
    except Exception as e:
        send({"type": "error", "message": f"yt-dlp chalu hoyni: {e}"})
        return

    last_err, final_file, last_pct = "", None, -1
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
        elif "ERROR" in line or "No module named" in line:
            last_err = line
    code = p.wait()

    if code == 0:
        send({"type": "done", "file": final_file or DOWNLOAD_DIR})
    else:
        if "No module named yt_dlp" in last_err or not last_err:
            last_err = last_err or "yt-dlp install nei — host\\install.bat abar run korun."
        send({"type": "error", "message": last_err})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        send({"type": "error", "message": str(e)})
