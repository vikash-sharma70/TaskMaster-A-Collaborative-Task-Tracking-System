'use strict';

const { Router } = require('express');
const validate = require('../../middlewares/validate');
const controller = require('./comment.controller');
const schemas = require('./comment.validation');

/** Mounted at /tasks/:taskId/comments (authentication applied by the parent router). */
const router = Router({ mergeParams: true });

router.get('/', validate(schemas.listComments), controller.list);
router.post('/', validate(schemas.addComment), controller.create);
router.patch('/:commentId', validate(schemas.updateComment), controller.update);
router.delete('/:commentId', validate(schemas.deleteComment), controller.remove);

module.exports = router;
