import { useEffect, useState } from "react";
import { ImageIcon, Upload, ImagePlus } from "lucide-react";
import { Modal, Spinner } from "../../ui";
import { BTN_PRIMARY, BTN_SECONDARY } from "./campaignStyles";
import { campaignRequest } from "../../../utils/campaignWorkspaceApi";
import { readFileAsDataUrl } from "../../../utils/uploadBlogImage";
import { compressImageFile } from "../../../utils/compressImageFile";
export default function CampaignImagePicker({ onSelect, disabled = false }) {
  const [open, setOpen] = useState(false),
    [assets, setAssets] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      void campaignRequest("/assets")
        .then(setAssets)
        .catch((e) => setError(e.message));
  }, [open]);
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await compressImageFile(file);
      const asset = await campaignRequest("/assets", {
        method: "POST",
        body: { image: await readFileAsDataUrl(prepared), name: file.name },
      });
      setAssets((old) => [asset, ...old]);
      onSelect(asset.url);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={`${BTN_SECONDARY} w-full`}
        onClick={() => setOpen(true)}
      >
        <ImagePlus size={15} />
        Choose or upload image
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Image library"
        subtitle="Pick a previously uploaded image or upload a new one."
        size="lg"
      >
        <label
          className={`${BTN_PRIMARY} cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}
        >
          {busy ? <Spinner size={15} /> : <Upload size={15} />}
          {busy ? "Uploading…" : "Upload image"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={upload}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-600 text-sm mt-3">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className="text-left rounded-xl border border-navy-100 p-2 hover:border-cyan-500 hover:ring-2 hover:ring-cyan-500/20 transition-colors"
              onClick={() => {
                onSelect(asset.url);
                setOpen(false);
              }}
            >
              <img
                alt={asset.name}
                src={asset.url}
                className="w-full h-28 object-contain rounded-lg bg-navy-50"
              />
              <span className="block text-xs text-navy-600 truncate mt-2">{asset.name}</span>
            </button>
          ))}
        </div>
        {!assets.length && !busy && (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-navy-100 text-navy-400 flex items-center justify-center mx-auto mb-3">
              <ImageIcon size={24} />
            </div>
            <p className="text-sm text-navy-500">
              Upload your first campaign image.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
