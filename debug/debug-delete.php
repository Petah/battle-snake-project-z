<?php

function deleteDirectory($directory)
{
    if (is_dir($directory)) {
        $objects = scandir($directory);
        foreach ($objects as $object) {
            if ($object != '.' && $object != '..') {
                if (is_dir($directory . DIRECTORY_SEPARATOR . $object) && !is_link($directory . DIRECTORY_SEPARATOR . $object)) {
                    deleteDirectory($directory . DIRECTORY_SEPARATOR . $object);
                } else {
                    unlink($directory . DIRECTORY_SEPARATOR . $object);
                }
            }
        }
        rmdir($directory);
    }
}

deleteDirectory(__DIR__ . '/../games/');

header('Location: debug.php');
