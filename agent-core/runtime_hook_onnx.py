"""PyInstaller runtime hook: add onnxruntime capi dir to DLL search path."""
import os
import sys

if hasattr(sys, '_MEIPASS'):
    _onnx_capi = os.path.join(sys._MEIPASS, "onnxruntime", "capi")
    if os.path.isdir(_onnx_capi) and hasattr(os, "add_dll_directory"):
        os.add_dll_directory(_onnx_capi)
