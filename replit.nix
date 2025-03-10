{ pkgs }: {
    deps = [
        pkgs.nodejs-18_x
        pkgs.chromium
        pkgs.ffmpeg
        pkgs.wget
        pkgs.nodePackages.typescript
        pkgs.nodePackages.pm2
        pkgs.python3
        pkgs.git
        pkgs.which
        pkgs.pkg-config
        pkgs.cairo
        pkgs.pango
        pkgs.libpng
        pkgs.libjpeg
        pkgs.giflib
        pkgs.librsvg
        pkgs.webp
    ];
} 