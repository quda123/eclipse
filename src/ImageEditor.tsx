import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { RotateCw, X } from "lucide-react";

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
async function cropImage(src: string, crop: Area, rotation: number) {
  const image = await loadImage(src),
    r = (rotation * Math.PI) / 180,
    boxW =
      Math.abs(Math.cos(r) * image.width) +
      Math.abs(Math.sin(r) * image.height),
    boxH =
      Math.abs(Math.sin(r) * image.width) +
      Math.abs(Math.cos(r) * image.height);
  const source = document.createElement("canvas");
  source.width = boxW;
  source.height = boxH;
  const context = source.getContext("2d")!;
  context.translate(boxW / 2, boxH / 2);
  context.rotate(r);
  context.translate(-image.width / 2, -image.height / 2);
  context.drawImage(image, 0, 0);
  const output = document.createElement("canvas");
  output.width = crop.width;
  output.height = crop.height;
  output
    .getContext("2d")!
    .drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  return new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Не удалось обработать изображение")),
      "image/jpeg",
      0.9,
    ),
  );
}

export default function ImageEditor({
  src,
  onClose,
  onSave,
}: {
  src: string;
  onClose: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [area, setArea] = useState<Area>(),
    [busy, setBusy] = useState(false);
  return (
    <div
      className="editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
    >
      <section className="editor">
        <header>
          <h2 id="editor-title">Подготовить страницу</h2>
          <button aria-label="Закрыть редактор" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="crop-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
            minZoom={1}
            maxZoom={3}
          />
        </div>
        <div className="editor-controls">
          <label>
            Масштаб
            <input
              type="range"
              min="1"
              max="3"
              step=".05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <button
            className="button secondary"
            onClick={() => setRotation((value) => value + 90)}
          >
            <RotateCw size={17} /> Повернуть
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setCrop({ x: 0, y: 0 });
              setZoom(1);
              setRotation(0);
            }}
          >
            Сбросить
          </button>
          <button
            className="button"
            disabled={!area || busy}
            onClick={async () => {
              if (!area) return;
              setBusy(true);
              try {
                onSave(await cropImage(src, area, rotation));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Обработка…" : "Сохранить страницу"}
          </button>
        </div>
      </section>
    </div>
  );
}
