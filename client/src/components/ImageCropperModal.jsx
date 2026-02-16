import React, { useState, useRef, useEffect } from 'react'
import { X, ZoomIn, ZoomOut, Save, RotateCcw } from 'lucide-react'
import './ImageCropperModal.css'

export default function ImageCropperModal({ imageSrc, onCancel, onSave }) {
    const [zoom, setZoom] = useState(1)
    const [minZoom, setMinZoom] = useState(0.1) // New state for minimum zoom
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const imgRef = useRef(null)
    const containerRef = useRef(null)
    const CROP_SIZE = 256

    // Calculate initial zoom to fit the image within the container
    const onImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target
        const CONTAINER_SIZE = 300 // Defined in CSS

        // Calculate scale needed to fit the image inside container
        // Using Math.min ensures the WHOLE image is visible (contain)
        // If we wanted to cover the box, we'd use Math.max
        // User requested "starts without zoom", implying full view.
        const fitScale = Math.min(CONTAINER_SIZE / naturalWidth, CONTAINER_SIZE / naturalHeight)

        // Set initial zoom to fit
        setZoom(fitScale)
        setMinZoom(fitScale)
    }

    const handleMouseDown = (e) => {
        setIsDragging(true)
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        })
    }

    // ... (keep middle handlers same, implicitly handled by not replacing them if range is right, but here I'm replacing a block so I need to be careful with lines)

    const handleMouseMove = (e) => {
        if (!isDragging) return
        e.preventDefault()
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        })
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    // Touch support (omitted from comparison for brevity in logic check, but needed in replacement)
    // Actually, I should use replace_file_content on specific blocks or include all. 
    // The instructions say "replacing a single contiguous block".
    // I need to replace from line 6 to ...
    // Let's look at the file content again.
    // I will replace lines 6-19 (state + onImageLoad) and lines 166-175 (slider) separately? 
    // No, I can't do parallel.
    // I'll do one large replacement or use `multi_replace`.
    // Multi_replace is safer.


    const handleMouseDown = (e) => {
        setIsDragging(true)
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        })
    }

    const handleMouseMove = (e) => {
        if (!isDragging) return
        e.preventDefault()
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        })
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    // Touch support
    const handleTouchStart = (e) => {
        setIsDragging(true)
        const touch = e.touches[0]
        setDragStart({
            x: touch.clientX - position.x,
            y: touch.clientY - position.y
        })
    }

    const handleTouchMove = (e) => {
        if (!isDragging) return
        // e.preventDefault() // prevent scrolling
        const touch = e.touches[0]
        setPosition({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y
        })
    }

    const handleSave = () => {
        try {
            const canvas = document.createElement('canvas')
            canvas.width = CROP_SIZE
            canvas.height = CROP_SIZE
            const ctx = canvas.getContext('2d')

            const image = imgRef.current
            const container = containerRef.current

            // Calculate scale relative to the container size (300px in css)
            // But we want output 256x256. 
            // So we need to map the visual representation to the actual image pixels.

            // 1. Determine the displayed size of the image
            // aspect ratio of image
            const aspect = image.naturalWidth / image.naturalHeight

            // In CSS we are likely just scaling it
            // Let's assume the container is 300x300 for calculation simplicity in display,
            // but we want high quality output.

            // Better approach: Draw directly from the transformed geometry

            // The container center is (150, 150) visually.
            // The image center is (naturalWidth/2, naturalHeight/2)
            // We applied a translation of (position.x, position.y) and scale (zoom)

            // We want to capture the 300x300 area (visually) into a 256x256 canvas.

            // To simplify, let's just make the canvas 300x300 first then resize if needed.
            const drawCanvas = document.createElement('canvas')
            drawCanvas.width = 300
            drawCanvas.height = 300
            const dCtx = drawCanvas.getContext('2d')

            // Fill white background
            dCtx.fillStyle = '#ffffff'
            dCtx.fillRect(0, 0, 300, 300)

            // Translate to center of canvas
            dCtx.translate(150, 150)
            dCtx.translate(position.x, position.y)
            dCtx.scale(zoom, zoom)
            dCtx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2) // Move origin to image top-left relative to center

            // Draw
            dCtx.drawImage(image, 0, 0)

            // Now resize to desired output (CROP_SIZE)
            ctx.drawImage(drawCanvas, 0, 0, 300, 300, 0, 0, CROP_SIZE, CROP_SIZE)

            // Get data URL
            const base64 = canvas.toDataURL('image/jpeg', 0.85)
            onSave(base64)

        } catch (err) {
            console.error(err)
            alert('Erro ao cortar imagem.')
        }
    }

    return (
        <div className="cropper-modal-overlay">
            <div className="cropper-modal-content">
                <div className="cropper-header">
                    <h3>Ajustar Foto</h3>
                    <button onClick={onCancel} className="close-btn"><X size={24} /></button>
                </div>

                <div className="cropper-body">
                    <div
                        className="crop-container"
                        ref={containerRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleMouseUp}
                    >
                        {/* We use margin: auto to center naturally if not transformed, but we are absolute positioning */}
                        <img
                            ref={imgRef}
                            src={imageSrc}
                            alt="Crop target"
                            className="crop-image"
                            style={{
                                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                                top: '50%',
                                left: '50%'
                            }}
                            onLoad={onImageLoad}
                            draggable={false}
                        />
                        {/* Visual overlay for circle crop feeling (optional) */}
                        {/* <div className="crop-overlay square"></div> */}
                    </div>
                </div>

                <div className="cropper-controls">
                    <div className="zoom-control">
                        <ZoomOut size={20} color="var(--color-slate-500)" />
                        <input
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.1"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="zoom-slider"
                        />
                        <ZoomIn size={20} color="var(--color-slate-500)" />
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                        Arraste para mover • Use o slider para zoom
                    </p>
                </div>

                <div className="cropper-actions">
                    <button className="btn btn-outline" onClick={onCancel}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        <Save size={18} /> Salvar Recorte
                    </button>
                </div>
            </div>
        </div>
    )
}
