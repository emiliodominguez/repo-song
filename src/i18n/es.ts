import type { Messages } from "./en.ts";

export const es: Messages = {
	help: [
		"Uso: repo-song [ruta] [opciones]",
		"",
		"Convierte el historial de un repositorio git en una canción lofi tocada con instrumentos reales sampleados.",
		"",
		"Opciones:",
		"  -o, --out <archivo>   Archivo WAV de salida (por defecto: <repo>.wav)",
		"  -s, --seconds <n>     Duración en segundos, de 15 a 300 (por defecto: 45)",
		"      --seed <texto>    Usar esta semilla en lugar del commit raíz del repo",
		"  -h, --help            Mostrar esta ayuda",
		"  -v, --version         Mostrar la versión",
	].join("\n"),
	reading: "Leyendo {path}",
	repo: "{name} · {commits} commits · semilla {seed}",
	downloading: "Primera ejecución: descargando grabaciones de instrumentos ({size} MB, quedan guardadas para la próxima)",
	progress: "  {percent}%",
	composing: "Componiendo en {key} {scale}, {bpm} BPM, {seconds}s",
	rendering: "Renderizando",
	wrote: "Escrito {file} ({ms} ms)",
	errors: {
		not_a_repo: "{path} no está dentro de un repositorio git.",
		no_commits: "{path} todavía no tiene commits, así que no hay historial para tocar.",
		assets_download_failed: "No se pudo descargar {path} ({status}). Revisá tu conexión y probá de nuevo.",
		assets_missing: "Faltan las grabaciones de instrumentos en {path}. Borrá la carpeta y volvé a ejecutar para descargarlas.",
		invalid_seconds: "--seconds debe ser un número entre 15 y 300 (recibido: {value}).",
		write_failed: "No se pudo escribir {file}: {reason}",
		unexpected: "Algo salió mal: {reason}",
	},
};
