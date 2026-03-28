export function showToast(message, type = 'success') {
    // Prevent multiple identical toasts spamming
    const existingToasts = document.querySelectorAll('.global-toast');
    if (existingToasts.length > 2) {
        existingToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `global-toast toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerText = type === 'success' ? '✅' : '❌';

    const text = document.createElement('span');
    text.innerText = message;

    toast.appendChild(icon);
    toast.appendChild(text);

    document.body.appendChild(toast);

    // trigger enter animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // exit animation after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300); // match css transition duration
    }, 3000);
}
