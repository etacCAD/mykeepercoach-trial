const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
console.log('FFmpeg path:', ffmpegInstaller.path);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.getAvailableFormats((err, formats) => {
  console.log('Available formats:', Object.keys(formats).length);
});
