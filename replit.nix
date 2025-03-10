{ pkgs }: {
    deps = [
        pkgs.nodejs-16_x
        pkgs.chromium
        pkgs.ffmpeg
    ];
    env = {
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
        PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
    };
} 