function formatDate(date) {
  if (!date) return "No date provided";
  const formattedDate = new Date(date);
  const formattedDateString = formattedDate.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formattedDateString;
}

export { formatDate };
