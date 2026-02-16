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
            dCtx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2)

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
                    </div>
                </div>

                <div className="cropper-controls">
                    <div className="zoom-control">
                        <ZoomOut size={20} color="var(--color-slate-500)" />
                        <input
                            type="range"
                            min={minZoom}
                            max={Math.max(minZoom * 5, 3)}
                            step="0.01"
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
