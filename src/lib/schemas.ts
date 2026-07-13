import { z } from 'zod'

export const usernameSchema = z.string().normalize().trim().toLowerCase().regex(/^[a-zа-яё0-9_.-]+$/iu, 'Разрешены буквы, цифры, _, - и .').min(2).max(40)
export const homeworkSchema = z.object({ title: z.string().trim().min(1, 'Введите название'), topicId: z.string().uuid('Выберите тему'), attemptsAllowed: z.coerce.number().int().positive('Нужна хотя бы одна попытка'), deadlineAt: z.string().datetime('Укажите срок сдачи') })
