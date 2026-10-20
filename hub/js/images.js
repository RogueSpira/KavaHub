// Shrinks a photo on the device before upload (same approach as the trivia tool):
// longest side up to 1600px, saved as JPEG at 86% quality. Small PNGs stay PNG (keeps
// transparency) and small GIFs are left alone (keeps animation). A big phone photo
// usually ends up around 200–500 KB.
export function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("That isn't a picture.")); return; }
    if (file.type === "image/gif" && file.size < 3.5e6) {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result); fr.onerror = () => reject(new Error("Couldn't read that picture."));
      fr.readAsDataURL(file); return;
    }
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600, k = Math.min(1, MAX / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const keepPng = file.type === "image/png" && file.size < 1.5e6;
      resolve(cv.toDataURL(keepPng ? "image/png" : "image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that picture.")); };
    img.src = url;
  });
}
