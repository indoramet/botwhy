{ pkgs }: {
    deps = [
        pkgs.nodejs-18_x
        pkgs.chromium
        pkgs.ffmpeg
        pkgs.wget
        pkgs.nodePackages.typescript
        pkgs.nodePackages.pm2
    ];
} 