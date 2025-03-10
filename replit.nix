{ pkgs }: {
    deps = [
        pkgs.nodejs-18_x
        pkgs.chromium
        pkgs.ffmpeg
        pkgs.nodePackages.typescript-language-server
        pkgs.nodePackages.yarn
        pkgs.replitPackages.jest
    ];
    env = {
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
        PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
    };
} 